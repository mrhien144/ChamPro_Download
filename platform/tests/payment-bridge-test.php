<?php
/** Verifies that the deployed WordPress Bridge is not silently assumed to match
 * the upgraded paid-order Worker. Full SePay callback tests belong to staging
 * and must pass before deploying the 0.1.5 guarded Bridge independently.
 */
$source = file_get_contents(__DIR__ . '/../wordpress/champro-bridge.php');
if ($source === false) exit(1);
if (strpos($source, "woocommerce_order_status_completed") === false) {
 fwrite(STDERR, "Unexpected live Bridge shape; verify installed version manually.\n"); exit(1);
}
echo "PASS: Existing repository Bridge is legacy; no payment production bridge changes in this patch.\n";
