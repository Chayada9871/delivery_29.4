-- Reset operational data for Sophon Driver / Delivery app.
-- This script preserves staff accounts in `app_users`.
-- Review table names before running if you changed APP_CONFIG in lib/config.js.

begin;

delete from public.purchase_orders;
delete from public.app_logs;

-- Uncomment the next line if you also want to remove saved custom prices.
-- delete from public.product_prices;

commit;
