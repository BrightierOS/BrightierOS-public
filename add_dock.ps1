$pages = @('public\files.html','public\store.html','public\login.html','public\setup.html')

$dock = @"

<nav class="dock">
    <a href="/" class="dock-item" data-page="dashboard">
        <span class="dock-icon">🏠</span>
        <span class="dock-label">Dashboard</span>
    </a>
    <a href="/files.html" class="dock-item" data-page="files">
        <span class="dock-icon">📁</span>
        <span class="dock-label">Files</span>
    </a>
    <a href="/console.html" class="dock-item" data-page="console">
        <span class="dock-icon">💻</span>
        <span class="dock-label">Console</span>
    </a>
    <a href="/store.html" class="dock-item" data-page="store">
        <span class="dock-icon">🛒</span>
        <span class="dock-label">Store</span>
    </a>
</nav>

<script>
    document.querySelectorAll('.dock-item').forEach(function(item) {
        var href = item.getAttribute('href');
        var current = window.location.pathname;
        if (href === current || (href === '/' && (current === '/index.html' || current === '/'))) {
            item.classList.add('active');
        }
    });
</script>

"@

foreach ($p in $pages) {
    $f = Get-Content $p -Raw
    $f = $f.Replace('</body>', $dock + '</body>')
    Set-Content $p -NoNewline -Value $f
    Write-Host "Dock added to $p"
}
