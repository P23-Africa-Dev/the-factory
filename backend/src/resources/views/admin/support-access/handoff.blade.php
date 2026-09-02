<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="referrer" content="no-referrer">
    <title>Starting support session</title>
</head>
<body>
    <form id="support-handoff" method="POST" action="{{ $handoffUrl }}">
        <input type="hidden" name="code" value="{{ $exchangeCode }}">
        <noscript>
            <p>JavaScript is disabled. Select continue to start the support session.</p>
            <button type="submit">Continue</button>
        </noscript>
    </form>
    <script>
        document.getElementById('support-handoff').submit();
    </script>
</body>
</html>
