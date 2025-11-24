from datasets import load_dataset, Dataset, concatenate_datasets
from typing import cast
from dataclasses import dataclass
import re
import dspy


@dataclass
class Position:
    line: int
    character: int


@dataclass
class Range:
    start: Position
    end: Position


@dataclass
class ContextItem:
    filename: str
    snippet: str

    def __str__(self) -> str:
        return f"<context_item>\n<filename>{self.filename}</filename>\n<snippet>\n{self.snippet}\n</snippet>\n</context_item>"


@dataclass
class EditItem:
    filename: str
    diff: str

    def __str__(self) -> str:
        return f"<edit_item>\n<filename>{self.filename}</filename>\n<diff>\n{self.diff}\n</diff>\n</context_item>"


@dataclass
class ExcerptItem:
    filename: str
    content: str
    editable_range: Range
    position: Position | None

    def __str__(self) -> str:
        lines = self.content.split("\n")

        # Collect all insertions by line, then sort by character position
        insertions: dict[int, list[tuple[int, str]]] = {}

        insertions.setdefault(self.editable_range.start.line, []).append(
            (self.editable_range.start.character, "<|editable_start|>")
        )
        insertions.setdefault(self.editable_range.end.line, []).append(
            (self.editable_range.end.character, "<|editable_end|>")
        )
        if self.position is not None:
            insertions.setdefault(self.position.line, []).append(
                (self.position.character, "<|cursor|>")
            )

        # Process each line that has insertions
        for line_num, markers in insertions.items():
            # Sort by character position in reverse order to avoid offset issues
            markers.sort(key=lambda x: x[0], reverse=True)
            line = lines[line_num]
            for char_pos, marker in markers:
                line = line[:char_pos] + marker + line[char_pos:]
            lines[line_num] = line

        marked_content = "\n".join(lines)
        return f"<excerpt_item>\n<filename>{self.filename}</filename>\n<content>\n{marked_content}\n</content>\n</excerpt_item>"


@dataclass
class TaskItem:
    context: list[ContextItem]
    edits: list[EditItem]
    excerpt: ExcerptItem
    answer: str


def parse_message_content(user_content: str, assistant_content: str) -> TaskItem:
    """
    Parse the message content and extract context, edits, excerpt, and answer.
    Discards the prompt and keeps only the structured data.

    Args:
        user_content: The user message content containing context, edits, and excerpt
        assistant_content: The assistant's response/answer
    """
    context_items: list[ContextItem] = []
    edit_items: list[EditItem] = []
    excerpt_item: ExcerptItem | None = None

    # Extract context items
    context_pattern = r"<\|context_file\|>\s*([^\n]+)\s*<\|snippet\|>\s*(.*?)(?=<\|context_file\|>|### User Edits|$)"
    for match in re.finditer(context_pattern, user_content, re.DOTALL):
        filename = match.group(1).strip()
        snippet = match.group(2).strip()
        context_items.append(ContextItem(filename=filename, snippet=snippet))

    # Extract user edits
    edits_section_match = re.search(
        r"### User Edits:(.*?)(?=### User Excerpt:|$)", user_content, re.DOTALL
    )
    if edits_section_match:
        edits_section = edits_section_match.group(1)
        # Pattern to match: User edited file "filename" followed by ```diff ... ```
        edit_pattern = r'User edited file "([^"]+)"\s*```diff\s*(.*?)```'
        for match in re.finditer(edit_pattern, edits_section, re.DOTALL):
            filename = match.group(1).strip()
            diff = match.group(2).strip()
            edit_items.append(EditItem(filename=filename, diff=diff))

    # Extract excerpt
    excerpt_match = re.search(
        r'### User Excerpt:\s*"([^"]+)"\s*(.*)', user_content, re.DOTALL
    )
    if excerpt_match:
        filename = excerpt_match.group(1).strip()
        excerpt_content = excerpt_match.group(2).strip()

        # Find editable region markers
        editable_start_match = re.search(
            r"<\|editable_region_start\|>", excerpt_content
        )
        editable_end_match = re.search(r"<\|editable_region_end\|>", excerpt_content)

        # Find cursor position marker
        cursor_match = re.search(r"<\|user_cursor_is_here\|>", excerpt_content)

        # Calculate line and character positions
        if not editable_start_match:
            raise ValueError(
                "Editable region start marker <|editable_region_start|> not found in excerpt"
            )
        if not editable_end_match:
            raise ValueError(
                "Editable region end marker <|editable_region_end|> not found in excerpt"
            )

        # Count lines before the markers
        lines_before_start = excerpt_content[: editable_start_match.start()].count("\n")
        lines_before_end = excerpt_content[: editable_end_match.start()].count("\n")

        # Get the line containing the start marker to find character position
        start_line_content = excerpt_content[: editable_start_match.start()].split(
            "\n"
        )[-1]
        end_line_content = excerpt_content[: editable_end_match.start()].split("\n")[-1]

        editable_range = Range(
            start=Position(line=lines_before_start, character=len(start_line_content)),
            end=Position(line=lines_before_end, character=len(end_line_content)),
        )

        if cursor_match:
            lines_before_cursor = excerpt_content[: cursor_match.start()].count("\n")
            cursor_line_content = excerpt_content[: cursor_match.start()].split("\n")[
                -1
            ]
            position = Position(
                line=lines_before_cursor, character=len(cursor_line_content)
            )
        else:
            position = None

        # Remove the markers from content for the final output
        clean_content = excerpt_content
        clean_content = re.sub(r"<\|editable_region_start\|>", "", clean_content)
        clean_content = re.sub(r"<\|editable_region_end\|>", "", clean_content)
        clean_content = re.sub(r"<\|user_cursor_is_here\|>", "", clean_content)

        excerpt_item = ExcerptItem(
            filename=filename,
            content=clean_content,
            editable_range=editable_range,
            position=position,
        )

    # Raise error if excerpt was not found
    if excerpt_item is None:
        raise ValueError("User Excerpt section not found in user content")

    return TaskItem(
        context=context_items,
        edits=edit_items,
        excerpt=excerpt_item,
        answer=assistant_content,
    )


def parse_dataset(example):
    """Parse a single dataset example containing messages."""
    messages = example["messages"]
    user_message = next((msg for msg in messages if msg["role"] == "user"), None)
    assistant_message = next(
        (msg for msg in messages if msg["role"] == "assistant"), None
    )

    if not user_message:
        raise ValueError("No user message found in example")
    if not assistant_message:
        raise ValueError("No assistant message found in example")

    user_content = user_message["content"]
    assistant_content = assistant_message["content"]
    parsed = parse_message_content(user_content, assistant_content)
    return parsed


class NextEdit(dspy.Signature):
    """Predict the next edit to the text between <|editable_start|> and <|editable_end|> given the excerpt, the cursor position (denoted by <|cursor|>), prior edits, and relevant context."""

    context: str = dspy.InputField()
    edits: str = dspy.InputField()
    excerpt: str = dspy.InputField()
    edited: str = dspy.OutputField()


def items_to_dspy(items: list[TaskItem]) -> list[dspy.Example]:
    """Convert a parsed HuggingFace dataset into a list of dspy Examples."""
    examples: list[dspy.Example] = []

    for item in items:
        context = f"<context>\n{'\n'.join(map(str, item.context))}\n</context>"
        edits = f"<edits>\n{'\n'.join(map(str, item.edits))}\n</edits>"
        excerpt = str(item.excerpt)
        edited = item.answer

        example = dspy.Example(
            context=context, edits=edits, excerpt=excerpt, edited=edited
        ).with_inputs("context", "edits", "excerpt")
        examples.append(example)

    return examples


def main():
    ds = []
    for split in ["train_typescript", "train_python", "train_c"]:
        dataset = cast(Dataset, load_dataset("continuedev/instinct-data", split=split))
        ds.append(dataset)
    dataset_train = (
        concatenate_datasets(ds)
        .shuffle(seed=42)
        .filter(lambda example: example["messages"] is not None)
    )

    dataset_test = cast(
        Dataset, load_dataset("continuedev/instinct-data", split="test_typescript")
    )
    print(f"Loaded from continuedev/instinct-data")
    items_train = list(map(parse_dataset, dataset_train))[:100]
    items_test = list(map(parse_dataset, dataset_test))[:50]

    lm = dspy.LM(
        "openai/gpt-oss-120b",
        api_base="http://localhost:8000/v1",
        api_key="placeholder",
        model_type="chat",
    )
    judge_lm = dspy.LM(
        "openai/zai-glm-4.6",
        api_base="http://localhost:8000/v1",
        api_key="placeholder",
        model_type="chat",
    )
    dspy.configure(lm=lm)
    dspy.configure_cache(enable_disk_cache=False, enable_memory_cache=True)

    examples_train = items_to_dspy(items_train)
    examples_test = items_to_dspy(items_test)
    predict = dspy.Predict(NextEdit)

    class JudgeEdit(dspy.Signature):
        """Evaluate the quality of a predicted edit compared to the ground-truth edit using this rubric:

        Score 5: Functional match with the developer's ground-truth edit
        Score 4: Similar edit to the developer's ground-truth edit, although not an exact functional match
        Score 3: Edit does not match the ground truth but would reasonably be made by an expert developer in such a scenario
        Score 2: Edit does not logically follow from the previous edits and context
        Score 1: Edit is likely to hinder developer progress, such as large deletions or complete irrelevance
        Score 0: Malformed rewrite that does not line up with the editable region
        """

        context: str = dspy.InputField(desc="Context files and snippets")
        edits: str = dspy.InputField(desc="Prior user edits")
        excerpt: str = dspy.InputField(desc="Code excerpt with editable region")
        ground_truth_edit: str = dspy.InputField(
            desc="The ground-truth edit made by the developer"
        )
        predicted_edit: str = dspy.InputField(desc="The predicted edit to evaluate")
        edited_excerpt: str = dspy.InputField(
            desc="The full excerpt with the editable region replaced by the predicted edit"
        )
        score: int = dspy.OutputField(
            desc="Score from 0 to 5 based on the rubric: 5=functional match, 4=similar, 3=reasonable expert edit, 2=illogical, 1=hinders progress, 0=malformed"
        )
        feedback: str = dspy.OutputField(
            desc="Detailed feedback explaining the score based on the rubric criteria"
        )

    judge_predictor = dspy.Predict(JudgeEdit)

    def metric_with_feedback(
        example: dspy.Example,
        pred: dspy.Example,
        trace=None,
        pred_name=None,
        pred_trace=None,
    ) -> dspy.Prediction:
        # Extract the excerpt content and replace editable region with predicted edit
        excerpt_str = example["excerpt"]
        predicted_edit = pred["edited"]

        # Replace the editable region in the excerpt with the predicted edit
        edited_excerpt = re.sub(
            r"<\|editable_start\|>.*?<\|editable_end\|>",
            predicted_edit,
            excerpt_str,
            flags=re.DOTALL,
        )

        # Use LLM judge for evaluation
        with dspy.context(lm=judge_lm):
            judgment = judge_predictor(
                context=example["context"],
                edits=example["edits"],
                excerpt=example["excerpt"],
                ground_truth_edit=example["edited"],
                predicted_edit=predicted_edit,
                edited_excerpt=edited_excerpt,
            )

        try:
            score = int(judgment.score)
            # Ensure score is in [0, 5] range
            score = max(0, min(5, score))
        except Exception as e:
            print(f"Judge failed:\n{e}")
            # Fallback to exact match if judge fails
            score = 5 if example["edited"] == pred["edited"] else 0
            if score == 5:
                judgment.feedback = (
                    "Your answer is a functional match with the ground-truth edit."
                )
            else:
                judgment.feedback = "Your answer does not match the ground-truth edit.\nThink about what takeaways you can learn from this solution to improve your future answers and approach to similar problems."
                judgment.feedback += (
                    f"\n<ground_truth_edit>\n{example['edited']}\n</ground_truth_edit>"
                )

        # Scale score to 0-1 range (divide by 5 instead of 10)
        return dspy.Prediction(
            score=score / 5,
            feedback=judgment.feedback,
            edited_excerpt=edited_excerpt,
        )

    predict.load("dspy_gptoss.json")
    # optimizer = dspy.GEPA(
    #     metric=metric_with_feedback,
    #     auto="medium",
    #     track_stats=True,
    #     reflection_lm=dspy.LM(
    #         "openai/zai-glm-4.6",
    #         api_base="http://localhost:8000/v1",
    #         api_key="placeholder",
    #         model_type="chat",
    #     ),
    # )
    # optimized_program = optimizer.compile(
    #     predict,
    #     trainset=examples_train,
    #     valset=examples_test,
    # )
    # breakpoint()
    # optimized_program.save("test.json")

    evaluator = dspy.Evaluate(
        devset=examples_test,
        metric=metric_with_feedback,
        display_progress=True,
        display_table=5,
    )
    evaluator(predict)


if __name__ == "__main__":
    main()
