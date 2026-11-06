//! Read-only development/AI discovery and logical size accounting.
//! No file contents are opened. Symlinks and Windows reparse points are skipped.

mod model;
mod rules;
mod scanner;
mod exclusions;

pub use model::*;
pub use exclusions::Exclusions;
pub use scanner::{ScanOptions, SizeSink, inspect_workspace, scan_locations, scan_workspace,
    scan_locations_with_sink, scan_workspace_with_sink};
