// Note: Connecting the Pieces
// By declaring these 'mods' (modules), we are telling Rust:
// "Hey, our code is split up! Go look inside models.rs and commands.rs to find the rest of our logic."
pub mod models;
pub mod commands;

// Note: The Engine Starter
// This macro just tells Tauri that this is the absolute starting point of our application.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder
        ::default()
        // Note: Giving the App Superpowers
        // Plugins allow our app to do native OS things.
        // For example, 'dialog' lets us open the native Windows/Mac folder selection window.
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // Note: The Bridge! (Extremely Important)
        // This is where we wire React to Rust.
        // We must manually list every command we want React to be able to use via 'invoke()'.
        // If you write a new function in commands.rs but forget to add it here, React will throw an error saying it doesn't exist!
        .invoke_handler(
            tauri::generate_handler![
                commands::scan_directory,
                commands::write_bundle,
                commands::get_file_contents_for_copy
            ]
        )

        // Build the context and start the app window
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
