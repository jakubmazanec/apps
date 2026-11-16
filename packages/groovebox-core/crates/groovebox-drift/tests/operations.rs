//! The operation count: the stable build's busiest render batch of the worst-case scene stays
//! within the budget.

use groovebox_core::budget::WORST_BATCH_OPERATIONS;
use groovebox_drift::play::play;
use groovebox_drift::scene::parse;
use groovebox_drift::wasm::WasmRunner;
use std::fs;
use std::path::Path;

#[test]
fn the_worst_case_stays_within_the_operation_budget() {
    let package = Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("the crate lies two folders below the package");
    let path = package.join("scenes/worst-case.scene");
    let scene = fs::read_to_string(&path)
        .map_err(|error| error.to_string())
        .and_then(|text| parse(&text))
        .unwrap_or_else(|error| panic!("{}: {error}", path.display()));
    let mut runner = WasmRunner::new(&package.join("build/groovebox-core.wasm"));

    play(&scene, &mut runner);

    let busiest = runner.busiest_render();
    assert!(
        busiest <= WORST_BATCH_OPERATIONS as u64,
        "the busiest render batch of the worst case took {busiest} operations, more than the \
        budget's {WORST_BATCH_OPERATIONS}"
    );
}
