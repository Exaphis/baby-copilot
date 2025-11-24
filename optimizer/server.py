from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import dspy
from main import NextEdit, parse_message_content, TaskItem
import re

app = FastAPI()

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class EditRequest(BaseModel):
    filePath: str
    editableContent: str
    cursorOffset: int
    diffTrajectory: list[dict]  # [{"path": str, "diff": str}]
    contextItems: Optional[list[dict]] = []  # [{"filename": str, "snippet": str}]


class EditResponse(BaseModel):
    content: str


# Global predictor instance
predictor: Optional[dspy.Predict] = None


def initialize_model():
    """Initialize the DSPy model."""
    global predictor

    # Configure the LM to use local server
    lm = dspy.LM(
        "openai/gpt-oss-120b",
        api_base="http://localhost:8000/v1",
        api_key="placeholder",
        model_type="chat",
        reasoning_effort="low",
        allowed_openai_params=["reasoning_effort"],
    )
    dspy.configure(lm=lm)
    dspy.configure_cache(enable_disk_cache=False, enable_memory_cache=True)

    # Create predictor and load optimized weights
    predictor = dspy.Predict(NextEdit)
    try:
        predictor.load("dspy_gptoss.json")
        print("Loaded optimized DSPy model from dspy_gptoss.json")
    except FileNotFoundError:
        print("Warning: dspy_gptoss.json not found, using unoptimized model")


@app.on_event("startup")
async def startup_event():
    """Initialize the model on startup."""
    initialize_model()


@app.post("/predict-edit")
async def predict_edit(request: EditRequest) -> EditResponse:
    """Predict the next edit based on context, edits, and excerpt."""
    import time

    req_start = time.time()

    if predictor is None:
        raise HTTPException(status_code=500, detail="Model not initialized")

    try:
        # Build context string
        build_start = time.time()
        context_str = ""
        if request.contextItems:
            context_parts = []
            for item in request.contextItems:
                context_parts.append(
                    f"<context_item>\n<filename>{item['filename']}</filename>\n"
                    f"<snippet>\n{item['snippet']}\n</snippet>\n</context_item>"
                )
            context_str = f"<context>\n{chr(10).join(context_parts)}\n</context>"
        else:
            context_str = "<context>\n</context>"

        # Build edits string
        edits_parts = []
        for edit in request.diffTrajectory:
            edits_parts.append(
                f"<edit_item>\n<filename>{edit['path']}</filename>\n"
                f"<diff>\n{edit['diff']}\n</diff>\n</edit_item>"
            )
        edits_str = f"<edits>\n{chr(10).join(edits_parts)}\n</edits>"

        # Build excerpt with markers
        content = request.editableContent
        cursor_offset = request.cursorOffset

        # Insert cursor marker
        content_with_cursor = (
            content[:cursor_offset] + "<|cursor|>" + content[cursor_offset:]
        )

        # Create excerpt with editable markers
        excerpt_str = (
            f"<excerpt_item>\n<filename>{request.filePath}</filename>\n"
            f"<content>\n<|editable_start|>{content_with_cursor}<|editable_end|>\n"
            f"</content>\n</excerpt_item>"
        )

        build_time = (time.time() - build_start) * 1000
        print(f"[Timing] Build prompt: {build_time:.1f}ms")

        # Call the predictor
        predict_start = time.time()
        prediction = predictor(
            context=context_str, edits=edits_str, excerpt=excerpt_str
        )
        predict_time = (time.time() - predict_start) * 1000
        print(f"[Timing] DSPy prediction: {predict_time:.1f}ms")

        edited_content = prediction.edited.strip()

        # Strip all markers if they appear in the output
        postprocess_start = time.time()
        edited_content = re.sub(r"<\|editable_start\|>", "", edited_content)
        edited_content = re.sub(r"<\|editable_end\|>", "", edited_content)
        edited_content = re.sub(r"<\|cursor\|>", "", edited_content)
        edited_content = edited_content.strip()

        postprocess_time = (time.time() - postprocess_start) * 1000
        total_time = (time.time() - req_start) * 1000
        print(f"[Timing] Postprocess: {postprocess_time:.1f}ms")
        print(f"[Timing] Total server: {total_time:.1f}ms")

        return EditResponse(content=edited_content)

    except Exception as e:
        print(f"Error during prediction: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "model_loaded": predictor is not None}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
