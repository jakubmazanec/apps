use groovebox_core::palette::PALETTE;
use groovebox_drift::image::write_png;
use groovebox_drift::native::NativeRunner;
use groovebox_drift::play::{Outcome, play};
use groovebox_drift::scene::{SceneLine, parse};
use groovebox_drift::wasm::WasmRunner;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

/// The text of the fingerprints file for this outcome.
fn fingerprints(outcome: &Outcome) -> String {
    format!(
        "audio {:016x}\n{}",
        outcome.audio,
        outcome
            .frames
            .iter()
            .map(|(sample, fingerprint, _)| format!("frame {sample} {fingerprint:016x}\n"))
            .collect::<String>()
    )
}

/// Writes each frame of the outcome as `frame-<sample>.png` into `directory` and returns the paths.
fn write_frames(directory: &Path, outcome: &Outcome) -> Vec<PathBuf> {
    fs::create_dir_all(directory)
        .unwrap_or_else(|error| panic!("{}: {error}", directory.display()));
    outcome
        .frames
        .iter()
        .map(|(sample, _, pixels)| {
            let path = directory.join(format!("frame-{sample}.png"));
            write_png(&path, pixels, &PALETTE);
            path
        })
        .collect()
}

#[test]
fn every_scene_plays_the_same_in_every_build() {
    let package = Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("the crate lies two folders below the package");
    let scenes = package.join("scenes");
    let mut paths: Vec<PathBuf> = fs::read_dir(&scenes)
        .unwrap_or_else(|error| panic!("{}: {error}", scenes.display()))
        .map(|entry| entry.expect("the scenes folder is readable").path())
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "scene")
        })
        .collect();
    paths.sort();
    assert!(!paths.is_empty(), "{} holds no scenes", scenes.display());
    let bless = env::var_os("GROOVEBOX_BLESS").is_some_and(|value| value == "1");

    for path in paths {
        let name = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .expect("a scene's name is UTF-8");
        let scene = fs::read_to_string(&path)
            .map_err(|error| error.to_string())
            .and_then(|text| parse(&text))
            .unwrap_or_else(|error| panic!("{}: {error}", path.display()));

        let native = play(&scene, &mut NativeRunner::default());
        let mut stable_runner = WasmRunner::new(&package.join("build/groovebox-core.wasm"));
        let stable = play(&scene, &mut stable_runner);
        let fallback = play(
            &scene,
            &mut WasmRunner::new(&package.join("build/fallback/groovebox-core.wasm")),
        );
        assert!(
            native == stable && native == fallback,
            "{name}: the builds differ\nnative:\n{}stable:\n{}fallback:\n{}",
            fingerprints(&native),
            fingerprints(&stable),
            fingerprints(&fallback),
        );
        assert_eq!(
            stable_runner.audio_fingerprint(),
            stable.audio,
            "{name}: the stable build's own audio fingerprint differs from the harness's"
        );
        assert!(
            native.finite,
            "{name}: the audio holds a sample that is not finite"
        );
        for line in &scene {
            if let SceneLine::ExpectAudio { fingerprint, .. } = *line {
                assert_eq!(
                    native.audio, fingerprint,
                    "{name}: the audio differs from its expect-audio line"
                );
            }
        }

        let file = scenes.join(format!("{name}.fingerprints"));
        let actual = fingerprints(&native);
        match (!bless && file.exists()).then(|| fs::read_to_string(&file)) {
            None => {
                fs::write(&file, &actual)
                    .unwrap_or_else(|error| panic!("{}: {error}", file.display()));
                write_frames(&scenes.join(name), &native);
            }
            Some(Ok(blessed)) if blessed.lines().eq(actual.lines()) => {}
            Some(Ok(blessed)) => {
                let written: String =
                    write_frames(&package.join("target/drift").join(name), &native)
                        .iter()
                        .map(|path| format!("{}\n", path.display()))
                        .collect();
                panic!(
                    "{name}: the fingerprints differ from {}\nblessed:\n{blessed}actual:\n{actual}\
                    The actual frames are in:\n{written}Run with GROOVEBOX_BLESS=1 to accept them.",
                    file.display()
                );
            }
            Some(Err(error)) => panic!("{}: {error}", file.display()),
        }
    }
}
