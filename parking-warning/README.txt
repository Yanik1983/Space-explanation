Parking Guard – spoken warning (Hebrew)

Sentence: "החניה עדיין פעילה. לא לשכוח לעצור אותה."
Engine: VoxCPM2 (openbmb/VoxCPM2, Apache-2.0), CPU, cfg 2.0, 10 inference timesteps.
Voice description (voice design): "calm adult man in his thirties, deep clear voice, friendly but serious, moderate pace"

take1, take2, take3: voice design with torch seeds 1, 2, 3 (each seed gives a different voice).
take4, take5, take6: the voice of take1, cloned from take1, with seeds 4, 5, 6 (same voice, different delivery).

Files: takeN.ogg (libvorbis -q:a 5, mono, for Android res/raw) and takeN.mp3 (preview).
Exact tool versions: versions.txt (written by the workflow).
The voice is synthetic (no real person), and the audio may be used in the app (Apache-2.0).
Made by .github/workflows/parking-warning.yml + parking-warning/make.py on branch tts-parking-warning.

Female voice (added later):
Voice description (voice design): "calm adult woman in her thirties, clear warm voice, friendly but serious, moderate pace"
female1, female2, female3: voice design with torch seeds 11, 12, 13 (each seed gives a different voice), same cfg 2.0 / 10 timesteps.
Files: femaleN.ogg (libvorbis -q:a 5, mono) and femaleN.mp3 (preview). Made with: python3 parking-warning/make.py female
The male takes (take1-6) were not regenerated.

English (added later):
Sentence: "Your parking is still on. Remember to stop it."
en_male1, en_male2, en_male3: the voice of take1, cloned from take1.ogg (timbre reference only, no Hebrew prompt text), seeds 21, 22, 23.
en_female1, en_female2, en_female3: the voice of female1, cloned from female1.ogg the same way, seeds 31, 32, 33.
Same cfg 2.0 / 10 timesteps. Files: .ogg (libvorbis -q:a 5, mono) and .mp3 (preview). Made with: python3 parking-warning/make.py en
Tool versions of the latest run: versions.txt. The Hebrew takes were not regenerated.
