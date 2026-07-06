import { FileNode } from "./types";

// Note: The "Path Collector"
// Imagine you have a big box (a folder) and you want a list of EVERY single item inside it.
// If it finds a sub-box (another folder), it calls itself to open that one up and grab its items too! (This is called recursion).
// We use this when you click a folder's checkbox so we instantly know the paths of all 100 files hidden inside it.
export const getAllPaths = (node: FileNode): string[] => {
  // If the folder is ignored (like node_modules), don't even bother looking inside.
  if (node.is_disabled) return [];

  let paths = [node.path];

  if (node.children) {
    node.children.forEach((child) => {
      // The magic happens here: we combine our current list with whatever the child finds inside itself.
      paths = paths.concat(getAllPaths(child));
    });
  }
  return paths;
};

// Note: The "ASCII Map Maker"
// This is the function that draws the beautiful text-based family tree (├── folder, └── file).
// It acts like a bouncer: if 'checkedPaths' is provided, it checks the guest list. If a file isn't checked, it skips it.
export const generateTreeString = (
  node: FileNode,
  checkedPaths: Set<string> | null,
  prefix: string = "",
): string => {
  // Bouncer check: Are we filtering? Yes. Is this file on the list? No. Then draw nothing ("").
  if (checkedPaths && !checkedPaths.has(node.path)) return "";

  let result = "";

  if (node.children) {
    // Only look at children that made it onto the guest list
    const visibleChildren = checkedPaths
      ? node.children.filter((child) => checkedPaths.has(child.path))
      : node.children;

    visibleChildren.forEach((child, index) => {
      // Is this the very last file in the folder?
      const isLast = index === visibleChildren.length - 1;

      // If it's the last item, draw an 'L' shape (└──). Otherwise, draw a 'T' shape (├──).
      const pointer = isLast ? "└── " : "├── ";

      // Add the current line to our final text map
      result += `${prefix}${pointer}${child.name}\n`;

      if (child.is_dir) {
        // If it's a folder, we need to indent the next layer deeper.
        // If the parent was the last item, we just add blank spaces. Otherwise, we carry down the vertical wall (│).
        const extension = isLast ? "    " : "│   ";

        // Dive into the folder to draw its children!
        result += generateTreeString(child, checkedPaths, prefix + extension);
      }
    });
  }
  return result;
};
