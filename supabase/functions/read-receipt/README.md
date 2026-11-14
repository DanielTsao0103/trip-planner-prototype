The receipt vision pilot runs only for signed-in users listed in the Supabase
secret `RECEIPT_VISION_USER_IDS` (comma-separated Auth user IDs). Set
`OPENAI_API_KEY` in Supabase Edge Function secrets and deploy `read-receipt`.
The default model is `gpt-4.1-mini`. Set `RECEIPT_VISION_MODEL` to override it.

Build the frontend with `VITE_RECEIPT_VISION=true`. For GitHub Pages, set that
public flag as a GitHub Actions repository variable. Set
`RECEIPT_EXTRA_ORIGINS` to allow an additional development origin if needed.

When a pilot user presses Save expense, the function sends the photo to OpenAI
for extraction. The app uses its USD total, description, and category in the
existing expense save. An unclear or non-USD total leaves the budget untouched.
The sample trip and signed-in accounts outside the pilot use on-device OCR.
Account receipt attachments use the existing private Supabase storage bucket.
