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
  private hasCheckBox: boolean = true;

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
    parent.Sort();
    return node;
  }

  public static parseFromLine(parent: TodoNode, title: string): TodoNode {
    let node = new TodoNode(parent);
    node.title = title.trim().substring(1);
    parent.children.push(node);

    if (node.title.indexOf("[x]") >= 0) {
      node.title = node.title.replace("[x]", "");
      node.isDone = true;
    } else if (node.title.indexOf("[ ]") >= 0) {
      node.title = node.title.replace("[ ]", "");
      node.isDone = false;
    } else {
      node.isDone = false;
      node.hasCheckBox = false;
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
    } else if (node.title.indexOf("[P3]") >= 0) {
      node.title = node.title.replace("[P3]", "");
      node.selfPriority = 3;
    } else {
      node.selfPriority = 4;
    }
    node.title = node.title.trimStart();

    console.log("node.title: %s, priority: %d", node.title, node.selfPriority);

    parent.Sort();
    return node;
  }

  public toString() {
    if (this.parent == null) {
      return "<root>";
    }
    let completion = "";
    if (this.hasCheckBox) {
      completion = this.isDone ? "[x]" : "[ ]";
    }

    let priority = ` [P${this.selfPriority}]`;
    if (completion === "") {
      priority=priority.trim();
    }
    if (this.selfPriority >= 4) {
      priority = "";
    }
    // console.log("priority=[%s], <%s>", completion, priority);
    return `${"  ".repeat(this.level)}- ${completion}${priority} ${this.title}`;
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
      if (a.selfPriority != b.selfPriority) {
        return a.selfPriority - b.selfPriority;
      }
      return 0; // Keep the original sequence
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

  public IsRoot(): boolean {
    return this.parent == null;
  }

  public IsDone(): boolean {
    return this.isDone;
  }

  public RemoveCompletedLeafNode(): TodoNode[] {
    let pending: TodoNode[] = [];
    let done: TodoNode[] = [];

    for (let child of this.children) {
      if (child.children.length === 0 && child.isDone) {
        done.push(child);
      } else {
        pending.push(child);
      }
    }
    this.children = pending;
    return done;
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
    while (spaces <= 2 * this.lastParentNode.GetLevel()) {
      this.lastParentNode = this.lastParentNode.GetParent();
    }
    // console.log("line: %s, parent: ", line, this.lastParentNode);
    this.lastParentNode = TodoNode.parseFromLine(this.lastParentNode, line);
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
    let doneTopCompleteItems = this.root.RemoveCompletedLeafNode();
    for (let node of doneTopCompleteItems) {
      r.push(node);
    }

    return r;
  }

  AddTodoNode(node: TodoNode) {
    this.root.UpsertChild(node.GetPath());
  }
}

const ZONE_NORMAL = 0;
const ZONE_COMPLETED_TASK = 1;

function isTodoLine(line: string) {
  let trimmed = line.trimStart();
  // if (trimmed.startsWith("- [x]") || trimmed.startsWith("- [ ]")) {
  //   return true;
  // }
  // if (trimmed.startsWith("- [P")) {
  //   return true
  // }
  if (trimmed.startsWith("-")) {
    return true;
  }
  return false;
}
class TodoDocument {
  private sections: Section[] = [];
  private lastSection: Section;
  private completedTodoSection: TodoSection = new TodoSection();
  public constructor(private text: string) {
    this.lastSection = new TextSection();
    this.sections.push(this.lastSection);
    let lines = text.split("\n");

    let zone = ZONE_NORMAL;
    for (let line of lines) {
      if (line.startsWith("================ Completed Tasks =============")) {
        zone = ZONE_COMPLETED_TASK;
      }

      if (zone == ZONE_NORMAL) {
        this.getOrCreateSection(line).consume(line);
      } else if (zone == ZONE_COMPLETED_TASK) {
        if (isTodoLine(line)) {
          this.completedTodoSection.consume(line);
        }
      }
    }
  }

  public format(): string[] {
    let r: string[] = [];

    for (let section of this.sections) {
      if (section instanceof TodoSection) {
        let items = section.RemoveCompleteItems();
        for (let item of items) {
          this.completedTodoSection.AddTodoNode(item);
        }
      }
      r.push(...section.asLines());
    }

    let completedLines = this.completedTodoSection.asLines();

    if (completedLines.length > 0) {
      r.push("================ Completed Tasks =============");
    }

    r.push(...this.completedTodoSection.asLines());

    return r;
  }

  public getOrCreateSection(line: string): Section {
    let trimmed = line.trimStart();
    let isTodo = isTodoLine(line);

    if (isTodo && this.lastSection instanceof TodoSection) {
      return this.lastSection;
    }
    if (!isTodo && this.lastSection instanceof TextSection) {
      return this.lastSection;
    }

    if (isTodo) {
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

  const fullrange = new vscode.Range(0, 0, 100000, 100000);
  edit.replace(fullrange, reFormatText(text));
  editor.selection.anchor = anchor;
}
