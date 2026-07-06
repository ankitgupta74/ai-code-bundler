import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  FolderOpen,
  Download,
  Loader2,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import "./App.css";
import { FileNode } from "./types";
import { getAllPaths, generateTreeString } from "./utils";
import { TreeNode } from "./components/TreeNode";

// --- MAIN APP COMPONENT ---
function App() {
  // Note: The "Memory" of our app.
  // 'treeData' holds the entire folder structure Rust gives us.
  // 'checkedPaths' acts as our "Guest List". It's a Set (a fast list of unique items) holding the exact paths of everything the user ticked.
  const [treeData, setTreeData] = useState<FileNode | null>(null);
  const [checkedPaths, setCheckedPaths] = useState<Set<string>>(new Set());

  // UI Status flags to show loading spinners or success checkmarks.
  const [isScanning, setIsScanning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [includeFullTree, setIncludeFullTree] = useState(true);

  // Note: The "Front Door"
  // We use Tauri's native OS plugin to open a normal folder selection window.
  // Once the user picks a folder, we pass that path to our Rust backend ("scan_directory") to do the heavy lifting.
  const handleSelectFolder = async () => {
    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
      });

      if (selectedPath && typeof selectedPath === "string") {
        setIsScanning(true);

        const folderTree = await invoke<FileNode>("scan_directory", {
          path: selectedPath,
        });

        setTreeData(folderTree);
        // By default, when opening a new folder, we add EVERY file to our "Guest List" (checkedPaths).
        setCheckedPaths(new Set(getAllPaths(folderTree)));
        setIsScanning(false);
        setExportSuccess(false);
      }
    } catch (error) {
      console.error("Failed to select or scan folder:", error);
      setIsScanning(false);
    }
  };

  // Note: The "Soft Reset"
  // If the user adds a new file in VS Code, we need to update our map.
  // BUT we don't want to wipe out the 50 checkboxes they just carefully unchecked!
  // So, we ask Rust for a fresh map, but we intentionally keep our 'checkedPaths' exactly as they are.
  const handleRefresh = async () => {
    if (!treeData) return;
    setIsScanning(true);

    try {
      const folderTree = await invoke<FileNode>("scan_directory", {
        path: treeData.path,
      });

      setTreeData(folderTree);
      setExportSuccess(false);
    } catch (error) {
      console.error("Failed to refresh folder:", error);
    } finally {
      setIsScanning(false);
    }
  };

  // Note: The "Cascade Effect"
  // When a user clicks a folder's checkbox, we don't just toggle the folder.
  // We grab EVERY path inside it (getAllPaths) and either add them all to the Guest List, or kick them all out.
  const handleToggleNode = (node: FileNode, isChecked: boolean) => {
    const pathsToToggle = getAllPaths(node);

    setCheckedPaths((prev) => {
      const next = new Set(prev); // Copy the old list so React knows it changed
      if (isChecked) {
        pathsToToggle.forEach((p) => next.add(p));
      } else {
        pathsToToggle.forEach((p) => next.delete(p));
      }
      return next;
    });
  };

  // Note: The Clipboard Engines
  // These functions communicate with the user's OS clipboard.
  // We gather the required paths, send them to Rust to fetch the actual file text, and then copy it.

  // 1. Copies the actual CODE inside ALL files in a folder.
  const handleCopyNode = async (node: FileNode, onSuccess: () => void) => {
    if (!treeData) return;
    try {
      const pathsToCopy = getAllPaths(node);
      const contentString = await invoke<string>("get_file_contents_for_copy", {
        filePaths: pathsToCopy,
        rootPath: treeData.path,
      });

      if (contentString) {
        await navigator.clipboard.writeText(contentString);
        onSuccess();
      }
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  // 2. Copies the actual CODE, but filters the list to ONLY include files on our Guest List (checkedPaths).
  const handleCopySelectedNode = async (
    node: FileNode,
    onSuccess: () => void,
  ) => {
    if (!treeData) return;
    try {
      const allPaths = getAllPaths(node);
      const selectedPaths = allPaths.filter((p) => checkedPaths.has(p));

      if (selectedPaths.length === 0) return;

      const contentString = await invoke<string>("get_file_contents_for_copy", {
        filePaths: selectedPaths,
        rootPath: treeData.path,
      });

      if (contentString) {
        await navigator.clipboard.writeText(contentString);
        onSuccess();
      }
    } catch (error) {
      console.error("Failed to copy selected content:", error);
    }
  };

  // 3. Copies the ASCII Family Tree (├──) for EVERYTHING in the folder.
  const handleCopyStructure = async (node: FileNode, onSuccess: () => void) => {
    try {
      const rootString = `${node.name}/\n`;
      // Passing 'null' disables filtering, drawing every single file.
      const treeString = rootString + generateTreeString(node, null);
      const finalOutput = `\`\`\`text\n${treeString}\`\`\``;

      await navigator.clipboard.writeText(finalOutput);
      onSuccess();
    } catch (error) {
      console.error("Failed to copy structure:", error);
    }
  };

  // 4. Copies the ASCII Family Tree (├──), but ONLY draws the branches that lead to checked files.
  const handleCopySelectedStructure = async (
    node: FileNode,
    onSuccess: () => void,
  ) => {
    try {
      const rootString = `${node.name}/\n`;
      const treeString = rootString + generateTreeString(node, checkedPaths);
      const finalOutput = `\`\`\`text\n${treeString}\`\`\``;

      await navigator.clipboard.writeText(finalOutput);
      onSuccess();
    } catch (error) {
      console.error("Failed to copy selected structure:", error);
    }
  };

  // Note: The Grand Finale (.txt File Generator)
  // Instead of copying to the clipboard, this packages up our visual tree AND our file contents, then tells Rust: "Go write this to a literal file on the user's hard drive."
  const handleExportBundle = async () => {
    if (!treeData) return;
    setIsExporting(true);
    setExportSuccess(false);

    try {
      // If the user turned off the "Full map" toggle, we send an empty string.
      // Rust is programmed to skip writing the map section if this is empty!
      const treeString = includeFullTree
        ? `${treeData.name}/\n` + generateTreeString(treeData, null)
        : "";

      const outputPath = `${treeData.path}/AI_BUNDLE_${treeData.name}.txt`;

      await invoke("write_bundle", {
        outputPath: outputPath,
        treeString: treeString,
        filePaths: Array.from(checkedPaths),
        rootPath: treeData.path,
      });

      setIsExporting(false);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (error) {
      console.error("Export failed:", error);
      setIsExporting(false);
    }
  };

  return (
    <div className="h-screen flex flex-col p-4 md:p-6 lg:p-8 xl:p-10 selection:bg-neutral-800 overflow-hidden bg-[#080808] transition-all duration-300">
      <div className="max-w-7xl w-full mx-auto flex flex-col h-full gap-4 md:gap-5 lg:gap-6 xl:gap-8">
        {/* Responsive Premium Header Area */}
        <div className="flex flex-col md:flex-row md:items-center justify-between shrink-0 bg-neutral-900/40 p-4 md:p-5 lg:p-6 rounded-xl border border-neutral-800/60 shadow-sm gap-4 transition-all duration-300">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-xl md:text-2xl lg:text-3xl font-light tracking-tight text-white transition-all">
              Codebase Bundler
            </h1>
            <p
              className={`text-[11px] md:text-xs text-neutral-500 font-mono tracking-wide truncate max-w-65 md:max-w-md lg:max-w-xl transition-all
                ${treeData ? "px-2.5 py-1 rounded-md bg-neutral-800/60 border border-neutral-700/50 text-neutral-400 inline-block mt-1" : ""}`}
            >
              {treeData
                ? treeData.path
                : "Select a directory to prepare context for AI"}
            </p>
          </div>

          {/* Action Buttons wrapped for smaller screens, inline for larger */}
          <div className="flex flex-wrap items-center gap-3 lg:gap-4">
            {treeData && (
              <button
                onClick={() => setIncludeFullTree((v) => !v)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-200 select-none
                    ${
                      includeFullTree
                        ? "bg-neutral-700/60 border-neutral-600 text-neutral-200"
                        : "bg-transparent border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-400"
                    }`}
              >
                <span
                  className={`w-2 h-2 rounded-full transition-colors duration-200 ${includeFullTree ? "bg-white" : "bg-neutral-600"}`}
                />
                Full map
              </button>
            )}

            {treeData && (
              <button
                onClick={handleRefresh}
                disabled={isScanning || isExporting}
                title="Refresh folder"
                className="p-2 lg:p-2.5 bg-transparent border border-neutral-700/70 rounded-lg hover:bg-neutral-800 hover:border-neutral-600 hover:text-white active:scale-95 transition-all duration-150 text-neutral-400 disabled:opacity-40 flex items-center justify-center"
              >
                <RefreshCw
                  size={16}
                  className={isScanning ? "animate-spin text-white" : ""}
                />
              </button>
            )}

            <button
              onClick={handleSelectFolder}
              disabled={isScanning || isExporting}
              className="px-4 py-2 lg:px-5 lg:py-2.5 bg-transparent border border-neutral-700 rounded-lg shadow-sm hover:bg-neutral-800 hover:text-white transition-all duration-200 text-xs lg:text-sm font-medium text-neutral-300 disabled:opacity-50"
            >
              {isScanning
                ? "Scanning..."
                : treeData
                  ? "Change Folder"
                  : "Select Folder"}
            </button>

            {treeData && (
              <button
                onClick={handleExportBundle}
                disabled={isExporting || checkedPaths.size === 0}
                className={`flex items-center gap-2 px-4 py-2 lg:px-6 lg:py-2.5 rounded-lg transition-all duration-200 text-xs lg:text-sm font-medium disabled:opacity-40 active:scale-[0.97]
                  ${
                    exportSuccess
                      ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/50"
                      : "bg-white text-black hover:bg-neutral-100 active:bg-neutral-200 border border-white"
                  }`}
              >
                {isExporting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />{" "}
                    <span className="hidden sm:inline">Bundling...</span>
                  </>
                ) : exportSuccess ? (
                  <>
                    <CheckCircle2 size={16} />{" "}
                    <span className="hidden sm:inline">Success!</span>
                  </>
                ) : (
                  <>
                    <Download size={16} />{" "}
                    <span className="hidden sm:inline">Generate .txt</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Tree View Area */}
        {treeData ? (
          <div className="flex-1 overflow-auto border border-neutral-800/60 rounded-xl bg-neutral-900/20 p-4 md:p-5 lg:p-6 xl:p-8 shadow-inner custom-scrollbar transition-all duration-300">
            <TreeNode
              node={treeData}
              checkedPaths={checkedPaths}
              onToggle={handleToggleNode}
              onCopy={handleCopyNode}
              onCopySelected={handleCopySelectedNode}
              onCopyStructure={handleCopyStructure}
              onCopySelectedStructure={handleCopySelectedStructure}
              defaultOpen={true}
            />
          </div>
        ) : (
          <div
            className="flex-1 flex flex-col items-center justify-center border border-neutral-800/40 border-dashed rounded-xl bg-neutral-900/10 gap-4 transition-all duration-300 cursor-pointer group"
            onClick={handleSelectFolder}
          >
            <FolderOpen
              size={36}
              className="text-neutral-700 group-hover:text-neutral-500 transition-colors duration-200"
            />
            <div className="flex flex-col items-center gap-1">
              <p className="text-neutral-400 text-xs lg:text-sm font-medium">
                Drop a folder, or click to browse
              </p>
              <p className="text-neutral-600 text-[11px] font-mono">
                Select a directory to bundle for AI context
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
