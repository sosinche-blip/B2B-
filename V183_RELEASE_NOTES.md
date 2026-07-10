# V183 R2 + Fixed IP Gateway

## Architecture
- Cloudflare Pages: mobile UI
- Cloudflare Worker: HTTPS API gateway and file operations
- Cloudflare R2 (`B2B_FILES`): purchase orders, vendor shipment files, generated upload files
- Supabase: mappings, templates, settings, sessions, audit logs
- Ncloud: fixed public IP gateway for Coupang/Toss API calls only
- GitHub Actions: verification and Worker deployment

## Main changes
1. `/api/local/*` compatibility routes now store/read files in R2, not Ncloud disk.
2. Multiple vendor invoice files can be selected with the 업체송장 button and saved to the shared R2 purchase folder.
3. 쿠팡+토스 업로드 reads R2 files, matches preparing orders, and sends channel updates through the fixed-IP API path.
4. Ncloud local file routes return 410 and no longer store Excel files.
5. Mixed-content HTTP folder calls are removed from production operation.

## Required Cloudflare setup
Create R2 buckets named `b2b-operation-files` and optionally `b2b-operation-files-preview`, then deploy the Worker.
