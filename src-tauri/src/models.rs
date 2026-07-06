// Note: 'serde' is our translator.
// It automatically converts this Rust data into JSON so our React frontend can read it perfectly.
use serde::{ Deserialize, Serialize };

// This macro magically adds the ability to print this struct for debugging (Debug), and allows it to be packaged up and sent across the bridge to React (Serialize/Deserialize).
#[derive(Debug, Serialize, Deserialize)]
pub struct FileNode {
    // Basic item details
    pub name: String,
    pub path: String,

    // Is this a folder? If true, it can hold children.
    pub is_dir: bool,

    // Should we grey this out in the UI? (e.g., node_modules or .env files)
    pub is_disabled: bool,

    // Option<> in Rust means this value can be 'Null' (None).
    // We use it to pass specific badge text like "Photos" or "Video". If it's not disabled, it's just Null.
    pub disable_reason: Option<String>,

    // The magic of Recursion!
    // A folder can contain a list (Vec) of more FileNodes inside it.
    // If this item is just a single file, this stays Null (None).
    pub children: Option<Vec<FileNode>>,
}
