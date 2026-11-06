import assert from "node:assert/strict";
import { test } from "node:test";
import {
  centerSquare,
  googlePictureOf,
  initialsOf,
  isOwnPicturePath,
  pictureFileError,
  pictureObjectPath,
  resolvePicture,
} from "./profile-picture.ts";

const ID = "0b8f1c3e-5d2a-4f6b-9c1d-2e3f4a5b6c7d";
const OTHER = "11111111-2222-4333-8444-555555555555";
const FILE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

test("google users get their Google photo", () => {
  const user = {
    identities: [{ provider: "google", identity_data: { picture: "https://lh3.googleusercontent.com/a/pic=s96-c" } }],
    app_metadata: { provider: "google" },
  };
  assert.equal(googlePictureOf(user), "https://lh3.googleusercontent.com/a/pic=s96-c");
});

test("avatar_url in user metadata also works for google users", () => {
  const user = { app_metadata: { provider: "google" }, user_metadata: { avatar_url: "https://example.com/a.png" } };
  assert.equal(googlePictureOf(user), "https://example.com/a.png");
});

test("email accounts never get a Google photo, even with a picture in metadata", () => {
  const user = { app_metadata: { provider: "email" }, user_metadata: { avatar_url: "https://example.com/a.png" } };
  assert.equal(googlePictureOf(user), undefined);
  assert.equal(googlePictureOf(null), undefined);
});

test("only https photo urls are accepted", () => {
  const base = { app_metadata: { provider: "google" } };
  assert.equal(googlePictureOf({ ...base, user_metadata: { picture: "http://example.com/a.png" } }), undefined);
  assert.equal(googlePictureOf({ ...base, user_metadata: { picture: "javascript:alert(1)" } }), undefined);
  assert.equal(googlePictureOf({ ...base, user_metadata: { picture: "not a url" } }), undefined);
});

test("uploaded picture beats Google photo, which beats initials", () => {
  assert.deepEqual(resolvePicture("https://a/custom", "https://a/google"), { url: "https://a/custom", source: "custom" });
  assert.deepEqual(resolvePicture(null, "https://a/google"), { url: "https://a/google", source: "google" });
  assert.deepEqual(resolvePicture(undefined, undefined), { source: "initials" });
});

test("storage paths must sit in the account's own folder", () => {
  assert.equal(isOwnPicturePath(ID, `${ID}/${FILE}.webp`), true);
  assert.equal(isOwnPicturePath(ID, `${OTHER}/${FILE}.webp`), false);
  assert.equal(isOwnPicturePath(ID, `${ID}/nested/${FILE}.webp`), false);
  assert.equal(isOwnPicturePath(ID, `${ID}/${FILE}.gif`), false);
  assert.equal(isOwnPicturePath(ID, `${ID}/../${OTHER}/${FILE}.webp`), false);
  assert.equal(isOwnPicturePath(ID, null), false);
  assert.equal(isOwnPicturePath(ID, pictureObjectPath(ID, FILE, "image/webp")), true);
  assert.equal(isOwnPicturePath(ID, pictureObjectPath(ID, FILE, "image/png")), true);
  assert.equal(isOwnPicturePath(ID, pictureObjectPath(ID, FILE, "image/jpeg")), true);
});

test("chosen files are checked for type and size", () => {
  assert.equal(pictureFileError({ type: "image/png", size: 1000 }), "");
  assert.match(pictureFileError({ type: "image/gif", size: 1000 }), /JPEG, PNG, or WebP/);
  assert.match(pictureFileError({ type: "image/jpeg", size: 11 * 1024 * 1024 }), /10 MB/);
  assert.match(pictureFileError({ type: "image/jpeg", size: 0 }), /empty/);
});

test("center crop is the largest centered square", () => {
  assert.deepEqual(centerSquare(400, 300), { x: 50, y: 0, size: 300 });
  assert.deepEqual(centerSquare(300, 400), { x: 0, y: 50, size: 300 });
  assert.deepEqual(centerSquare(256, 256), { x: 0, y: 0, size: 256 });
});

test("initials match the previous avatar behavior", () => {
  assert.equal(initialsOf("Maya Chen"), "MC");
  assert.equal(initialsOf("Traveler"), "T");
  assert.equal(initialsOf("Ana Maria Lopez"), "AM");
});
