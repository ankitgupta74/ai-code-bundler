import { useState, useRef } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  File,
  FolderOpen,
  CheckCircle2,
  Copy,
  CopyCheck,
  ListTree,
  ListChecks,
} from "lucide-react";
import { FileNode } from "../types";

// --- RECURSIVE TREE COMPONENT ---
// Note: Think of this component like a set of Russian Matryoshka dolls.
// A folder renders its files, but if it sees another folder, it calls ITSELF to open that one too!
export const TreeNode = ({
  node,
  checkedPaths,
  onToggle,
  onCopy,
  onCopySelected,
  onCopyStructure,
  onCopySelectedStructure,
  defaultOpen = false,
}: any) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Note: These states just act as little 2-second timers.
  // We use them to temporarily swap the copy icon for a green checkmark to give the user visual feedback.
  const [isCopied, setIsCopied] = useState(false);
  const [isSelectedCopied, setIsSelectedCopied] = useState(false);
  const [isStructureCopied, setIsStructureCopied] = useState(false);
  const [isSelectedStructureCopied, setIsSelectedStructureCopied] =
    useState(false);

  const isChecked = checkedPaths.has(node.path);

  // We use a 'ref' for the timer because refs don't cause the component to re-render when they change.
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Note: The classic web dev problem - separating a single click from a double click.
  // 'e.detail' tells us exactly how many times the user clicked in rapid succession.
  const handleRowAction = (e: React.MouseEvent) => {
    if (node.is_disabled) return;

    if (clickTimer.current) clearTimeout(clickTimer.current);

    if (e.detail === 1) {
      // 1st click: Wait a tiny bit (250ms) to see if they click again. If they don't, toggle the checkbox.
      clickTimer.current = setTimeout(() => onToggle(node, !isChecked), 250);
    } else if (e.detail === 2) {
      // 2nd click: They double-clicked! The timer is cleared, so we skip the checkbox and just expand/collapse the folder.
      if (node.is_dir) setIsOpen(!isOpen);
    }
  };

  return (
    <div className="flex flex-col text-sm">
      <div
        className={`flex items-center gap-2 py-1.5 px-2 my-0.5 rounded-md group transition-colors duration-100 select-none 
          ${
            node.is_disabled
              ? "opacity-35 cursor-not-allowed grayscale"
              : "hover:bg-white/4 active:bg-white/[0.07] cursor-pointer"
          }`}
        onClick={handleRowAction}
      >
        <button
          onClick={(e) => {
            // Note: 'e.stopPropagation()' stops the click from "bubbling up" to the parent <div>.
            // Without this, clicking the chevron would ALSO trigger the row click and toggle your checkbox!
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          disabled={node.is_disabled}
          className={`p-0.5 rounded-md text-neutral-500 transition-colors 
            ${(!node.is_dir || node.is_disabled) && "invisible"} 
            ${!node.is_disabled && "hover:bg-neutral-700 hover:text-white"}`}
        >
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        <input
          title={node.is_disabled ? node.disable_reason : ""}
          type="checkbox"
          checked={isChecked && !node.is_disabled}
          disabled={node.is_disabled}
          onChange={() => {}}
          onClick={(e) => {
            // Same rule applies here. We stop the bubble so the row doesn't double-fire the toggle.
            e.stopPropagation();
            if (!node.is_disabled) onToggle(node, e.currentTarget.checked);
          }}
          className={`w-4 h-4 rounded-sm border-neutral-600 bg-neutral-900/50 text-white accent-neutral-300 transition-all
            ${node.is_disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
        />

        {node.is_dir ? (
          isOpen && !node.is_disabled ? (
            <FolderOpen size={16} className="text-neutral-300 ml-1" />
          ) : (
            <Folder size={16} className="text-neutral-500 ml-1" />
          )
        ) : (
          <File size={16} className="text-neutral-600 ml-1" />
        )}

        <span
          className={`truncate font-mono text-[13px] tracking-tight ml-1
          ${node.is_disabled ? "line-through text-neutral-500" : "text-neutral-200"}`}
        >
          {node.name}
        </span>

        {/* Note: The Action Bar
          We group our 4 copy buttons here. Notice the 'opacity-0 group-hover:opacity-100'.
          This keeps the UI looking clean and luxurious by hiding the buttons until the user hovers over this specific row.
        */}
        {node.is_disabled ? (
          <span className="ml-auto px-2 py-0.5 rounded-md border border-neutral-800/60 text-[10px] tracking-wider text-neutral-600 font-mono">
            {node.disable_reason && node.disable_reason !== "Ignored"
              ? `Ignored / ${node.disable_reason}`
              : "Ignored"}
          </span>
        ) : (
          <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
            {/* Copy FULL Structure Button (Folders Only) */}
            {node.is_dir && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCopyStructure(node, () => {
                    setIsStructureCopied(true);
                    setTimeout(() => setIsStructureCopied(false), 2000);
                  });
                }}
                title="Copy Full Folder Structure"
                className="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-700 hover:text-white"
              >
                {isStructureCopied ? (
                  <CheckCircle2 size={15} className="text-emerald-400" />
                ) : (
                  <ListTree size={15} />
                )}
              </button>
            )}

            {/* Copy SELECTED Structure Button (Folders Only) */}
            {node.is_dir && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCopySelectedStructure(node, () => {
                    setIsSelectedStructureCopied(true);
                    setTimeout(() => setIsSelectedStructureCopied(false), 2000);
                  });
                }}
                title="Copy Selected Folder Structure"
                className="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-700 hover:text-white"
              >
                {isSelectedStructureCopied ? (
                  <CheckCircle2 size={15} className="text-emerald-400" />
                ) : (
                  <ListChecks size={15} />
                )}
              </button>
            )}

            {/* NEW: Copy SELECTED Content Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopySelected(node, () => {
                  setIsSelectedCopied(true);
                  setTimeout(() => setIsSelectedCopied(false), 2000);
                });
              }}
              title={
                node.is_dir
                  ? "Copy Selected Content"
                  : "Copy Content (If Selected)"
              }
              className="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-700 hover:text-white"
            >
              {isSelectedCopied ? (
                <CheckCircle2 size={15} className="text-emerald-400" />
              ) : (
                <CopyCheck size={15} />
              )}
            </button>

            {/* Existing Copy ALL Content Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopy(node, () => {
                  setIsCopied(true);
                  setTimeout(() => setIsCopied(false), 2000);
                });
              }}
              title={node.is_dir ? "Copy All Content" : "Copy Content"}
              className="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-700 hover:text-white"
            >
              {isCopied ? (
                <CheckCircle2 size={15} className="text-emerald-400" />
              ) : (
                <Copy size={15} />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Note: The Magic Recursion
        If this node is a folder, is expanded (isOpen), and isn't disabled, we loop through its children.
        For every child, we render a brand new <TreeNode />. 
        Because it's a separate component, we MUST pass all our functions (onToggle, onCopy, etc.) down the chain like a bucket brigade so the deepest files can still talk to the main App.
      */}
      {node.is_dir && isOpen && node.children && !node.is_disabled && (
        <div className="ml-5.5 pl-3 border-l border-neutral-700/30 mt-0.5">
          {node.children.map((child: FileNode) => (
            <TreeNode
              key={child.path}
              node={child}
              checkedPaths={checkedPaths}
              onToggle={onToggle}
              onCopy={onCopy}
              onCopySelected={onCopySelected}
              onCopyStructure={onCopyStructure}
              onCopySelectedStructure={onCopySelectedStructure}
            />
          ))}
        </div>
      )}
    </div>
  );
};
