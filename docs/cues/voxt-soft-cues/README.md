# Voxt soft cues

11 pairs of soft two-note start/stop cues (start rises, stop falls) in actnowkit's catalogue format: `catalog.json` + `sounds/*.wav`, 44.1 kHz 16-bit stereo. All original synthesized sounds (`../make_chimes.py`), free to bundle.

Every sound has `uses: record.start|record.stop`, so `scripts/sync-sounds.sh`'s subset picks them up once merged into the sounds library. Rebuild: `python3 ../make_chimes.py && python3 ../build_voxt_catalog.py`.
