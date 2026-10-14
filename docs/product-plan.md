# Product plan: virtual try-on for local clothing shops

Status: draft for discussion. Prices were checked on 14 Oct 2026 from aggregator pages and change daily, so confirm them with each provider before committing. Anything marked *unverified* has not been checked.

## 1. Goal

Offer virtual try-on to a few local shops (starting with 4-5, possibly 10-15 later). Each shop gets a QR code. Customers scan it, take a live photo of themselves and see themselves wearing the shop's items. We rent one GPU for about 10-12 hours a day and split the cost across the shops.

## 2. Capacity

- Fast mode takes about 9.5 s per job on an RTX 3090, and jobs run one at a time.
- 5 shops x 100 try-ons a day is about 1.3 GPU-hours a day, so one 3090 is enough.
- Only peak moments cause a queue (three customers at once means the third waits about 30 s). Show a queue position or an estimate.
- Keep a fallback (second instance or a "temporarily unavailable" screen), since marketplace GPUs can disappear.

## 3. GPU rental

Monthly figures assume 12 h/day x 30 days = 360 h.

| Option | $/hr | ~Monthly | Notes |
|---|---|---|---|
| Vast.ai marketplace | ~0.09-0.14 | ~$32-50 | Cheapest, host quality varies. Docs: interruptible often 50%+ below on-demand, reserved up to 50% off. |
| HyperAI | 0.10 (0.06 reserved 1 month) | $36 on-demand | Reserved at 720 h is ~$43. Reliability unknown. |
| Salad | 0.17 (spot 0.09-0.14) | ~$61 | Spot can be interrupted. |
| RunPod Community | 0.22 | ~$79 | More predictable. Secure Cloud is 0.50 (~$180). |
| TensorDock | 0.31 | ~$112 | Monthly price unverified. |

Notes:
- Running only during shop hours (8-10 h/day) and auto-stopping when idle lowers the bill. The server already has `--idle-stop`. Cold starts take 1-3 minutes, so use a fixed daily schedule, not start-on-demand.
- *Unverified:* how each provider treats customers in Syria, and which payment methods they accept. Check each provider's terms first.
- While the existing 3090 can be used, the pilot costs nothing in rent.

## 4. Pricing for shops

- Rental alone is about $32-80 a month.
- At $5-6 per shop, 5 shops do not cover it; 10-15 shops do.
- Plan: pilot with 4-5 shops at about $10-12 each (or free on the existing 3090), then lower to $5-6 at 12+ shops.
- Flat monthly fee with a fair-use cap, not per-request billing.
- Free first month for the first 2-3 shops in exchange for feedback.
- Show shops numbers: try-ons per day, most-tried items, QR scans.

## 5. Shop features

- Per-shop login (admin-created accounts are enough for the pilot).
- Bulk catalog upload with category and garment type; reject bad photos (cropped, busy background, tiny) on upload.
- Precompute garment-side data on upload for all catalog items.
- A QR code per shop that opens that shop's try-on page. Customers do not log in.
- Usage counters only (jobs, timings, errors), never images.

## 6. Privacy

- The customer takes a live photo in the browser from their own phone via the shop's QR code. The photo goes straight to the server; it is never shown to the shop and is not in any dashboard. (Camera access needs HTTPS.)
- Process in memory and delete. Delete the result a few minutes after it is shown or when the page closes. No history, no photo-based feedback copies.
- Before launch, audit what the current demo stores (job history, uploads, recorded previews, logs) and remove anything that keeps images.
- Wording: "photos are deleted within X minutes and never used for training", not "never stored", because the image exists briefly on the rented machine. The privacy policy should say where processing happens.
- Add a short consent line before upload and get legal advice for the target country.

## 7. Licensing

- Model weights and code: Apache-2.0. DWPose/YOLOX: Apache-2.0.
- `fashn-human-parser` is non-commercial (NVIDIA SegFormer license).
- Alternatives checked: `mattmdjaga/segformer_b2_clothes` uses the "other" license tag pointing at NVIDIA's SegFormer license (same concern). Sapiens is CC BY-NC 4.0. SCHP code is listed MIT on a mirror, but its weights were trained on LIP/ATR datasets whose terms were not checked. SAM 2 is believed to be Apache-2.0 (*unverified*).
- Recommendation: remove the parser from the deployed server. The flat-lay path with `segmentation_free=True` does not use its output, so compare results with and without it to confirm they are identical. Use pose keypoints (DWPose) or SAM 2 where a mask is needed.
- Use our own brand name, not FASHN. Check the repo's terms on naming.

## 8. Improving quality

Ordered by value and effort:

1. **Input quality guidance.** Instructions on the live camera screen (full body, front view, plain background, fitted clothes) plus a quick reject-with-reason check.
2. **Garment preparation.** Clean flat-lay photos, consistent crops, background removal.
3. **Per-category settings.** The earlier sampler tests found that 15 steps with guidance on the first half looks like the full run; try per-garment-type tuning, and Quality mode for demos.
4. **Post-processing** (tested, see below).
5. **Fine-tuning.** Later. It needs paired data, which conflicts with the privacy promise. A LoRA for local garment styles is realistic only if the base model handles them badly, so test that first. Build a fixed evaluation set (about 30 people x 30 garments from the pilot shops' real stock) before changing anything.

### Post-processing experiment (5 saved results)

- The model outputs 576 px wide images from 832-896 px inputs and softens the face.
- Pasting the model's garment region onto the original full-resolution photo (feathered edge, mask from differencing result vs original) restores the face, background and shoes to original quality.
- Face sharpness (Laplacian variance), original / model upscaled / composite: person2 152 / 15 / 151; person0 123 / 71 / 122-123.
- Caveats: only 5 cases, seams not inspected at full resolution; a diff-based mask will have holes when old and new garments are similar in colour (white tee to white top), so production should use a pose- or SAM-based mask; compositing cannot fix wrong garment output (one result had a white band at the waist).
- Still to try on a GPU: face restoration, and upscaling of the garment region only.

## 9. Order of work

1. Settle the parser/licence question and the privacy rules.
2. Build the shop-facing version: login, catalog upload with precompute, QR link, usage counts, delete-after-use.
3. Run the evaluation set on 2-3 shops' real stock to see what quality can be promised.
4. Two-week pilot with free access; measure usage and ask what shops would pay.
5. Price it, then consider fine-tuning.

## Open questions

- Target country and garment types (local styles may matter for fine-tuning and language).
- Do shops have flat-lay photos or only photos on models?
- Phones via QR, or a shop tablet?
- What was meant to follow "about fine-tuning:" in the last message (left blank).

Sources: getdeploying.com/gpus/nvidia-rtx-3090, runpod.io/pricing, docs.vast.ai/pricing, huggingface.co/mattmdjaga/segformer_b2_clothes, github.com/facebookresearch/sapiens (LICENSE).
