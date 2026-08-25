<?php

declare(strict_types=1);

/**
 * One-shot helper: embeds backend/secrets/fcm-service-account.json into k8s/secret.yaml
 * as FCM_SERVICE_ACCOUNT_JSON (single-line JSON). Does not print the secret.
 */

$root = dirname(__DIR__, 2);
$jsonPath = $root.DIRECTORY_SEPARATOR.'secrets'.DIRECTORY_SEPARATOR.'fcm-service-account.json';
$secretPath = $root.DIRECTORY_SEPARATOR.'k8s'.DIRECTORY_SEPARATOR.'secret.yaml';

if (! is_readable($jsonPath)) {
    fwrite(STDERR, "Missing {$jsonPath}\n");
    exit(1);
}

$raw = file_get_contents($jsonPath);
if ($raw === false) {
    fwrite(STDERR, "Unable to read service account JSON\n");
    exit(1);
}

$data = json_decode($raw, true);
if (! is_array($data) || empty($data['private_key']) || empty($data['client_email'])) {
    fwrite(STDERR, "Service account JSON is invalid\n");
    exit(1);
}

$compact = json_encode($data, JSON_UNESCAPED_SLASHES);
if (! is_string($compact) || $compact === '') {
    fwrite(STDERR, "Failed to encode service account JSON\n");
    exit(1);
}

// YAML single-quoted string: escape ' as ''
$yamlValue = "'".str_replace("'", "''", $compact)."'";

$secret = file_get_contents($secretPath);
if ($secret === false) {
    fwrite(STDERR, "Missing {$secretPath}\n");
    exit(1);
}

$updated = preg_replace(
    '/FCM_SERVICE_ACCOUNT_JSON:\s*(?:""|\'\'|"[^"]*"|\'(?:\'\'|[^\'])*\')/',
    'FCM_SERVICE_ACCOUNT_JSON: '.$yamlValue,
    $secret,
    1,
    $count,
);

if ($count !== 1 || ! is_string($updated)) {
    fwrite(STDERR, "Could not find FCM_SERVICE_ACCOUNT_JSON placeholder in secret.yaml\n");
    exit(1);
}

if (file_put_contents($secretPath, $updated) === false) {
    fwrite(STDERR, "Failed to write secret.yaml\n");
    exit(1);
}

fwrite(STDOUT, "Updated k8s/secret.yaml FCM_SERVICE_ACCOUNT_JSON for project {$data['project_id']}\n");
