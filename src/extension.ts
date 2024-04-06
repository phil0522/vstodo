// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

import { reFormatTextTodo } from "./todo-doc";

async function UpdateTodoList(
  editor: vscode.TextEditor,
  edit: vscode.TextEditorEdit
) {
  let text = editor.document.getText();

  console.log(`text=${text}`);

  const fullrange = new vscode.Range(0, 0, 100000, 100000);
  edit.replace(fullrange, reFormatText(text));
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log(
    'Congratulations, your extension "helloworld-sample" is now active!'
  );

  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      "vstodo.update-todo-list",
      UpdateTodoList
    )
  );
}

export function reFormatText(textInput: string): string {
  let doc = reFormatTextTodo(textInput);
  return doc;
}
