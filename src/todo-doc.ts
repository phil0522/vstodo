import { error } from "console";
import { rootCertificates } from "tls";
import * as vscode from "vscode";

// Represents a document
interface Section {
  consume(line: string): void;
  asLines(): string[];
}

class TodoNode {
  private selfPriority: number = 3;
  private isDone: boolean = false;
  private children: TodoNode[] = [];
  private title: string = "";
  private level: number; // number of indent level, root has level of -1

  private constructor(private parent: TodoNode | null) {
    if (this.parent == null) {
      this.level = -1;
    } else {
      this.level = this.parent.level + 1;
    }
  }

  public static newRoot(): TodoNode {
    let node = new TodoNode(null);
    node.title = "<root>";
    return node;
  }

  public static cloneNodeData(parent: TodoNode, otherNode: TodoNode): TodoNode {
    let node = new TodoNode(parent);
    node.selfPriority = otherNode.selfPriority;
    node.title = otherNode.title;
    node.isDone = otherNode.isDone;
    return node;
  }

  public static parseFromLine(parent: TodoNode, title: string): TodoNode {
    let node = new TodoNode(parent);
    node.title = title.trim().substring(1);
    parent.children.push(node);
    parent.Sort();

    if (node.title.indexOf("[x]") >= 0) {
      node.title = node.title.replace("[x]", "");
      node.isDone = true;
    } else if (node.title.indexOf("[ ]") >= 0) {
      node.title = node.title.replace("[ ]", "");
      node.isDone = false;
    } else {
      node.isDone = false;
    }

    if (node.title.indexOf("[P0]") >= 0) {
      node.title = node.title.replace("[P0]", "");
      node.selfPriority = 0;
    } else if (node.title.indexOf("[P1]") >= 0) {
      node.title = node.title.replace("[P1]", "");
      node.selfPriority = 1;
    } else if (node.title.indexOf("[P2]") >= 0) {
      node.title = node.title.replace("[P2]", "");
      node.selfPriority = 2;
    } else {
      node.selfPriority = 3;
    }
    return node;
  }

  public toString() {
    if (this.parent == null) {
      return "<root>";
    }
    let completion = this.isDone ? "[x]" : "[ ]";
    let priority = `[P${this.selfPriority}]`;
    if (this.selfPriority >= 3) {
      priority = "";
    }
    return `${"  ".repeat(this.level)}- ${completion}${priority}${this.title}`;
  }

  public asLines() {
    let r: string[] = [];
    function dfs(node: TodoNode, output: string[]) {
      r.push(node.toString());
      for (let child of node.children) {
        dfs(child, r);
      }
    }

    for (let child of this.children) {
      dfs(child, r);
    }
    return r;
  }

  public GetPriority(): number {
    if (this.parent == null) {
      return this.selfPriority;
    }
    return Math.min(this.selfPriority, this.parent.GetPriority());
  }

  public Sort() {
    this.children.sort((a, b) => {
      if (a.isDone && !b.isDone) {
        return 1;
      }
      if (!a.isDone && b.isDone) {
        return -1;
      }
      if (a.GetPriority() != b.GetPriority()) {
        return a.GetPriority() - b.GetPriority();
      }
      return a.title < b.title ? -1 : 1;
    });
  }

  public UpsertChild(nodesInPath: TodoNode[]) {
    if (nodesInPath.length === 0) {
      return;
    }
    let node = nodesInPath[0];
    let rest = nodesInPath.slice(1);
    for (let child of this.children) {
      if (child.title === node.title) {
        child.selfPriority = node.selfPriority;
        child.isDone = node.isDone;
        child.UpsertChild(rest);
        return;
      }
    }

    let newNode = TodoNode.cloneNodeData(this, node);
    this.children.push(newNode);
    this.Sort();
    newNode.UpsertChild(rest);
  }

  public GetPath(): TodoNode[] {
    let r: TodoNode[] = [];
    let p: TodoNode = this;
    while (p.parent != null) {
      r.push(p);
      p = p.parent;
    }
    r.reverse();
    return r;
  }

  public GetChildren(): TodoNode[] {
    return this.children;
  }

  public ClearChildren() {
    this.children = [];
  }

  public GetLevel(): number {
    return this.level;
  }

  public GetParent(): TodoNode {
    if (this.parent == null) {
      throw new Error("Should not access parent of root.");
    }
    return this.parent;
  }

  public IsDone(): boolean {
    return this.isDone;
  }
}

class TextSection implements Section {
  private lines: string[] = [];

  consume(line: string) {
    this.lines.push(line);
  }
  asLines(): string[] {
    return this.lines;
  }
}

class TodoSection implements Section {
  private root: TodoNode = TodoNode.newRoot();
  private lastIndentLevel: number = 0;
  private lastParentNode: TodoNode = this.root;

  consume(line: string) {
    let spaces = this.numOfLeadingSpaces(line);
    if (spaces <= 2 * this.lastParentNode.GetLevel()) {
      this.lastParentNode = this.lastParentNode.GetParent();
    }
    this.lastParentNode = TodoNode.parseFromLine(this.lastParentNode, line);
    console.log("construct node: " + this.lastParentNode.toString());
  }

  private numOfLeadingSpaces(line: string) {
    for (let i = 0; i < line.length; ++i) {
      if (line[i] !== " ") {
        return i;
      }
    }
    return line.length;
  }
  asLines(): string[] {
    return this.root.asLines();
  }

  RemoveCompleteItems(): TodoNode[] {
    let r: TodoNode[] = [];
    function dfs(node: TodoNode): boolean {
      // Returns true if all children(if any) and self are completed.
      // In this case, remove the
      let allChildrenCompleted = true;
      for (let child of node.GetChildren()) {
        allChildrenCompleted = dfs(child) && allChildrenCompleted;
      }
      if (allChildrenCompleted && node.IsDone()) {
        r.push(...node.GetChildren());
        node.ClearChildren();
        return true;
      }
      return false;
    }
    dfs(this.root);
    return r;
  }

  AddTodoNode(node: TodoNode) {
    this.root.UpsertChild(node.GetPath());
  }
}

class TodoDocument {
  private sections: Section[] = [];
  private lastSection: Section;
  public constructor(private text: string) {
    this.lastSection = new TextSection();
    this.sections.push(this.lastSection);
    let lines = text.split("\n");
    for (let line of lines) {
      this.getOrCreateSection(line).consume(line);
    }
  }

  public format(): string[] {
    let r: string[] = [];
    let archivedSection = new TodoSection();

    for (let section of this.sections) {
      if (section instanceof TodoSection) {
        let items = section.RemoveCompleteItems();
        for (let item of items) {
          archivedSection.AddTodoNode(item);
        }
      }
      r.push(...section.asLines());
    }
    r.push(...archivedSection.asLines());

    return r;
  }

  public getOrCreateSection(line: string): Section {
    let trimmed = line.trimStart();
    let isTodoLine = false;
    if (trimmed.startsWith("- [x]") || trimmed.startsWith("- [ ]")) {
      isTodoLine = true;
    }

    if (isTodoLine && this.lastSection instanceof TodoSection) {
      return this.lastSection;
    }
    if (!isTodoLine && this.lastSection instanceof TextSection) {
      return this.lastSection;
    }

    if (isTodoLine) {
      this.lastSection = new TodoSection();
    } else {
      this.lastSection = new TextSection();
    }
    this.sections.push(this.lastSection);
    return this.lastSection;
  }
}

export function reFormatText(textInput: string): string {
  let doc = new TodoDocument(textInput);
  return doc.format().join("\n");
}

async function UpdateTodoList(
  editor: vscode.TextEditor,
  edit: vscode.TextEditorEdit
) {
  let text = editor.document.getText();

  let anchor = editor.selection.anchor;
  console.log(`text=${text}`);

  const fullrange = new vscode.Range(0, 0, 100000, 100000);
  edit.replace(fullrange, reFormatText(text));
  editor.selection.anchor = anchor;
}
