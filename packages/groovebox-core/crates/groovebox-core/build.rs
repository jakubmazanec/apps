use std::{env, fs, path::Path};

const BUDGET: &str = "../../budget.toml";

/// Turns a `name = integer` line into the source of a constant.
fn constant(line: &str) -> Option<String> {
    let (name, value) = line.split_once('=')?;
    let (name, value) = (name.trim(), value.trim());
    let is_name = name.starts_with(|first: char| first.is_ascii_lowercase())
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_');
    let is_integer = value.starts_with(|first: char| first.is_ascii_digit())
        && value.chars().all(|c| c.is_ascii_digit() || c == '_');
    (is_name && is_integer).then(|| {
        format!(
            "pub const {}: usize = {value};\n",
            name.to_ascii_uppercase()
        )
    })
}

fn main() {
    println!("cargo:rerun-if-changed={BUDGET}");
    let budget = fs::read_to_string(BUDGET).unwrap_or_else(|error| panic!("{BUDGET}: {error}"));
    let constants: String = budget
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(|line| {
            constant(line).unwrap_or_else(|| {
                panic!(
                    "{BUDGET}: expected `name = integer`, a comment or a blank line, found `{line}`"
                )
            })
        })
        .collect();
    let out_dir = env::var_os("OUT_DIR").expect("cargo sets OUT_DIR for build scripts");
    fs::write(Path::new(&out_dir).join("budget.rs"), constants).expect("OUT_DIR is writable");
}
