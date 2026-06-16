use crate::models::FileNode;
use std::fs;
use std::io::Write;
use std::path::PathBuf;

// Note: The "Do Not Enter" List
// Before we even start scanning, we define a list of folders and files that are completely useless for AI context.
// By ignoring these early, we save massive amounts of processing power and prevent the app from freezing while trying to read 10,000 node_module files!
const DEFAULT_IGNORE_LIST: &[&str] = &[
    ".git",
    ".gitignore",
    "node_modules",
    ".venv",
    "venv",
    "target",
    ".env",
    ".env.local",
    ".env.production",
    ".env.development",
    "dist",
    "build",
    ".next",
    "__pycache__",
    ".DS_Store",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
];

// Note: The Entry Point
// React calls this function and hands it a simple string path (like "C:/Projects/App").
// We convert it into a Rust 'PathBuf' (which is just a safer way for Rust to handle file paths across Mac/Windows) and start the engine.
#[tauri::command]
pub fn scan_directory(path: String) -> Result<FileNode, String> {
    let root_path = PathBuf::from(&path);
    build_tree(&root_path).map_err(|e| e.to_string())
}

// Note: The Recursive Explorer
// This function looks at a path. If it's a file, it just takes notes. 
// If it's a folder, it opens it, looks at every item inside, and if it finds ANOTHER folder, it calls ITSELF to open that one too!
pub fn build_tree(path: &PathBuf) -> Result<FileNode, std::io::Error> {
    // Grab the name of the file/folder (fallback to empty string if it fails)
    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    // Create our base "Node" (the Javascript object we will eventually send to React)
    let mut node = FileNode {
        name: name.clone(),
        path: path.to_string_lossy().to_string(),
        is_dir: path.is_dir(),
        is_disabled: false,
        disable_reason: None,
        children: None,
    };

    // If it's a folder, we need to dig inside
    if path.is_dir() {
        let mut children = Vec::new();
        for entry in fs::read_dir(path)? {
            let entry = entry?;
            let child_path = entry.path();
            let child_name = entry.file_name().to_string_lossy().to_string();

            // 1. The Bouncer: If the file is on our ignore list, or is a previously generated text file, mark it as "Ignored" and DO NOT open it.
            if DEFAULT_IGNORE_LIST.contains(&child_name.as_str()) || child_name.starts_with("AI_BUNDLE_") {
                children.push(FileNode {
                    name: child_name,
                    path: child_path.to_string_lossy().to_string(),
                    is_dir: child_path.is_dir(),
                    is_disabled: true,
                    disable_reason: Some("Ignored".to_string()),
                    children: None,
                });
                continue; // Skip the rest of the loop and move to the next file
            }

            // 2. The Media Filter: If it's a file, check its ID card (the file extension).
            // We can't send a .png to ChatGPT, so we disable it and tag it as "Photos", "Video", etc.
            if child_path.is_file() {
                if let Some(ext_os) = child_path.extension() {
                    let ext = ext_os.to_string_lossy().to_lowercase();
                    
                    let reason = match ext.as_str() {
                        "png" | "jpg" | "jpeg" | "gif" | "webp" | "ico" | "bmp" | "tiff" => Some("Photos".to_string()),
                        "mp4" | "mkv" | "avi" | "mov" | "wmv" | "flv" | "webm" => Some("Video".to_string()),
                        "mp3" | "wav" | "flac" | "m4a" | "ogg" => Some("Audio".to_string()),
                        "pdf" | "zip" | "tar" | "gz" | "7z" | "rar" | "exe" | "dll" | "so" | "dylib" | "bin" | "iso" => Some("Binary".to_string()),
                        _ => None,
                    };

                    if let Some(r) = reason {
                        children.push(FileNode {
                            name: child_name,
                            path: child_path.to_string_lossy().to_string(),
                            is_dir: false,
                            is_disabled: true,
                            disable_reason: Some(r),
                            children: None,
                        });
                        continue;
                    }
                }
            }

            // 3. The Dive: If the file passed all filters, run `build_tree` on IT! 
            if let Ok(child_node) = build_tree(&child_path) {
                children.push(child_node);
            }
        }
        
        // Sort the results: Folders at the top, files at the bottom, organized alphabetically.
        children.sort_by(|a, b| {
            b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        node.children = Some(children);
    }

    Ok(node)
}

// Note: The Publisher (.txt Generator)
// This function actually creates a file on your hard drive. 
// It takes all the selected files, formats them beautifully in Markdown, and writes them line-by-line.
#[tauri::command]
pub fn write_bundle(
    output_path: String,
    tree_string: String,
    file_paths: Vec<String>,
    root_path: String,
) -> Result<String, String> {
    // Create the blank .txt file at the destination
    let mut file = std::fs::File::create(&output_path).map_err(|e| e.to_string())?;

    writeln!(file, "# 🧠 CODEBASE CONTEXT BUNDLE\n").unwrap();
    
    // Conditionally write the family tree map ONLY if the user left the toggle "ON"
    if !tree_string.is_empty() {
        writeln!(file, "## 📁 REPOSITORY STRUCTURE\n```text\n{}```\n", tree_string).unwrap();
        writeln!(file, "---\n").unwrap();
    }
    
    writeln!(file, "## 📄 FILE CONTENTS\n").unwrap();

    let mut success_count = 0;
    for path_str in file_paths {
        let path = std::path::Path::new(&path_str);
        
        if path.is_file() {
            // Cut off the boring computer path ("C:/Users/...") and just keep the project path ("src/App.tsx")
            let relative_path = path.strip_prefix(&root_path).unwrap_or(path).to_string_lossy();
            
            // Grab the extension (.tsx) so Markdown can color-code the syntax perfectly for the AI
            let ext = path.extension().unwrap_or_default().to_string_lossy();

            writeln!(file, "### File: `{}`", relative_path).unwrap();
            
            // Try to read the file. If it succeeds, wrap it in backticks. If it fails (like a weird binary), skip it.
            match std::fs::read_to_string(path) {
                Ok(content) => {
                    writeln!(file, "```{}\n{}\n```\n", ext, content).unwrap();
                    success_count += 1;
                }
                Err(_) => {
                    writeln!(file, "> [Binary or unreadable file skipped]\n").unwrap();
                }
            }
        }
    }

    Ok(format!("Successfully bundled {} files.", success_count))
}

// Note: The Clipboard Manager
// This is exactly like the Publisher above, but INSTEAD of writing to the hard drive,
// it stitches everything into a massive invisible String memory variable and hands it back to React.
#[tauri::command]
pub fn get_file_contents_for_copy(
    file_paths: Vec<String>,
    root_path: String,
) -> Result<String, String> {
    let mut result = String::new(); // Our empty bucket to hold the text

    for path_str in file_paths {
        let path = std::path::Path::new(&path_str);
        
        if path.is_file() {
            let relative_path = path.strip_prefix(&root_path).unwrap_or(path).to_string_lossy();
            
            match std::fs::read_to_string(path) {
                Ok(content) => {
                    // Push the formatted text into our bucket. 
                    // Format: path \n " \n content \n " \n\n
                    result.push_str(&format!("{}\n\"\n{}\n\"\n\n", relative_path, content));
                }
                Err(_) => {
                    // Silently skips binary/unreadable files
                }
            }
        }
    }

    // Hand the full bucket back to React!
    Ok(result.trim_end().to_string())
}
