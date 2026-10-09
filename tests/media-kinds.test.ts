import test from "node:test";
import assert from "node:assert/strict";
import {
  MEDIA_RULES,
  coordsFromMapsUrl,
  extensionOf,
  isVoiceNote,
  locationProblem,
  mediaHint,
  mediaProblem,
  mediaRule,
} from "../src/lib/media-kinds.ts";

// --- media -----------------------------------------------------------------

test("every kind of media has a rule, and an unknown one falls back", () => {
  for (const kind of ["image", "video", "audio", "document"]) {
    assert.equal(mediaRule(kind).kind, kind);
  }
  assert.equal(mediaRule("hologram").kind, "image");
});

test("only audio refuses a caption", () => {
  // Not a style choice: WhatsApp refuses the whole message if one is sent,
  // because an audio bubble has nowhere to draw it.
  assert.equal(mediaRule("audio").caption, false);
  for (const kind of ["image", "video", "document"]) {
    assert.equal(mediaRule(kind).caption, true, kind);
  }
});

test("only documents take a filename", () => {
  assert.equal(mediaRule("document").filename, true);
  for (const kind of ["image", "video", "audio"]) {
    assert.equal(mediaRule(kind).filename, false, kind);
  }
});

test("an extension is read off a URL, not off a query string", () => {
  assert.equal(extensionOf("https://x.com/a/b/song.OGG"), "ogg");
  assert.equal(extensionOf("https://x.com/song.mp3?token=abc.pdf"), "mp3");
  assert.equal(extensionOf("https://x.com/song"), "");
  assert.equal(extensionOf("https://x.com/song."), "");
});

test("the format is what makes an audio file a voice note", () => {
  // There is no flag for it. WhatsApp renders OGG/OPUS with a waveform and
  // the same recording as an MP3 as a file with a paperclip.
  assert.equal(isVoiceNote("https://x.com/note.ogg"), true);
  assert.equal(isVoiceNote("https://x.com/note.opus"), true);
  assert.equal(isVoiceNote("https://x.com/note.mp3"), false);
});

test("a sharing page is named as the problem it is", () => {
  // The single most common cause of Meta's format mismatch: the link is to
  // a web page that happens to show a file, and WhatsApp downloads HTML.
  const problem = mediaProblem("image", "https://drive.google.com/file/d/abc/view");
  assert.match(problem!, /sharing page/i);
});

test("a wrong extension says which ones would work", () => {
  const problem = mediaProblem("video", "https://x.com/clip.mkv");
  assert.match(problem!, /\.mp4/);
  assert.match(problem!, /mkv/);
});

test("plain http is refused, because WhatsApp will not fetch it", () => {
  assert.match(mediaProblem("image", "http://x.com/a.jpg")!, /https/);
});

test("a URL with no extension at all is refused with the list", () => {
  assert.match(mediaProblem("audio", "https://x.com/track")!, /aac/);
});

test("a good URL has nothing to report", () => {
  assert.equal(mediaProblem("image", "https://cdn.example.com/a/photo.jpg"), null);
  assert.equal(mediaProblem("audio", "https://cdn.example.com/a/note.ogg"), null);
  assert.equal(mediaProblem("document", "https://cdn.example.com/a/invoice.pdf"), null);
});

test("the hint under the box says what will fit", () => {
  assert.match(mediaHint("video"), /16 MB/);
  assert.match(mediaHint("video"), /MP4/);
  // And for audio, the one thing nobody expects.
  assert.match(mediaHint("audio"), /voice note/);
});

test("no rule promises a size WhatsApp does not allow", () => {
  for (const rule of MEDIA_RULES) {
    assert.ok(rule.maxMb > 0 && rule.maxMb <= 100, rule.kind);
    assert.ok(rule.formats.length > 0, rule.kind);
  }
});

// --- location --------------------------------------------------------------

test("a pin needs both numbers, and an empty box is not zero", () => {
  // 0,0 is a real place, in the Atlantic. Sending somebody there is worse
  // than sending nothing.
  assert.match(locationProblem({ latitude: "", longitude: "" })!, /both/i);
  assert.match(locationProblem({ latitude: 18.5, longitude: "" })!, /both/i);
});

test("coordinates out of range are caught, with the likely cause", () => {
  assert.match(locationProblem({ latitude: 180, longitude: 18 })!, /wrong way round/i);
  assert.match(locationProblem({ latitude: 18, longitude: 400 })!, /-180/);
});

test("a real pin passes", () => {
  assert.equal(locationProblem({ latitude: 18.5204, longitude: 73.8567 }), null);
  assert.equal(locationProblem({ latitude: 0, longitude: 0 }), null);
});

test("coordinates are read out of a pasted Maps link", () => {
  // Nobody has latitude and longitude to hand; everybody has the link.
  assert.deepEqual(
    coordsFromMapsUrl("https://www.google.com/maps/@18.5204,73.8567,15z"),
    { latitude: 18.5204, longitude: 73.8567 }
  );
});

test("a place link carries them in a different shape, and that works too", () => {
  assert.deepEqual(
    coordsFromMapsUrl("https://www.google.com/maps/place/Pune/data=!3m1!4b1!3d18.5204!4d73.8567"),
    { latitude: 18.5204, longitude: 73.8567 }
  );
});

test("a bare pair pasted out of the search box is understood", () => {
  assert.deepEqual(coordsFromMapsUrl("18.5204, 73.8567"), {
    latitude: 18.5204,
    longitude: 73.8567,
  });
});

test("negative coordinates survive the round trip", () => {
  assert.deepEqual(coordsFromMapsUrl("https://maps.google.com/@-33.8688,151.2093,12z"), {
    latitude: -33.8688,
    longitude: 151.2093,
  });
});

test("a link with no coordinates in it gives nothing rather than a guess", () => {
  for (const bad of ["", "https://example.com", "not a link", "https://maps.google.com/place/Pune"]) {
    assert.equal(coordsFromMapsUrl(bad), null, bad);
  }
});

test("a link whose numbers are out of range is refused, not clamped", () => {
  assert.equal(coordsFromMapsUrl("https://maps.google.com/@999,999,15z"), null);
});
