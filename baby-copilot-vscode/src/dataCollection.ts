import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activateDataCollection(context: vscode.ExtensionContext) {
    const storagePath = context.globalStorageUri.fsPath;
    if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath, { recursive: true });
    }
    const logFilePath = path.join(storagePath, 'events.log');

    const documentCache = new Map<string, string>();

    const isTrackableDocument = (doc: vscode.TextDocument) => {
        return doc.uri.scheme === 'file' || doc.uri.scheme === 'untitled';
    };

    // Pre-populate cache with currently open documents
    vscode.workspace.textDocuments.forEach(doc => {
        if (isTrackableDocument(doc)) {
            documentCache.set(doc.uri.toString(), doc.getText());
        }
    });

    // Listen for newly opened documents
    vscode.workspace.onDidOpenTextDocument(doc => {
        if (isTrackableDocument(doc)) {
            documentCache.set(doc.uri.toString(), doc.getText());
        }
    });

    // Listen for closed documents to remove them from the cache
    vscode.workspace.onDidCloseTextDocument(doc => {
        documentCache.delete(doc.uri.toString());
    });

    // Listener for text document changes
    vscode.workspace.onDidChangeTextDocument(event => {
        if (!isTrackableDocument(event.document)) {
            return;
        }

        const timestamp = new Date().toISOString();
        const uriString = event.document.uri.toString();

        const beforeEditContent = documentCache.get(uriString) || '';

        // Update cache with new content
        documentCache.set(uriString, event.document.getText());

        const openFiles = vscode.window.visibleTextEditors
            .filter(editor => editor.document.uri !== event.document.uri && isTrackableDocument(editor.document))
            .map(editor => ({
                uri: editor.document.uri.toString(),
                content: editor.document.getText()
            }));

        const editData = {
            type: 'edit',
            timestamp,
            uri: uriString,
            beforeEditContent,
            openFiles,
            changes: event.contentChanges.map(change => ({
                range: {
                    start: {
                        line: change.range.start.line,
                        character: change.range.start.character
                    },
                    end: {
                        line: change.range.end.line,
                        character: change.range.end.character
                    }
                },
                text: change.text
            }))
        };

        fs.appendFileSync(logFilePath, JSON.stringify(editData) + '\n');
    });

    // Listener for cursor position changes
    vscode.window.onDidChangeTextEditorSelection(event => {
        if (!isTrackableDocument(event.textEditor.document)) {
            return;
        }

        const timestamp = new Date().toISOString();
        const cursorData = {
            type: 'cursor',
            timestamp,
            uri: event.textEditor.document.uri.toString(),
            selections: event.selections.map(selection => ({
                start: {
                    line: selection.start.line,
                    character: selection.start.character
                },
                end: {
                    line: selection.end.line,
                    character: selection.end.character
                }
            }))
        };

        fs.appendFileSync(logFilePath, JSON.stringify(cursorData) + '\n');
    });
}
