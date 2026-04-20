param(
  [Parameter(Mandatory = $true)][string]$Path
)

if (-not (Test-Path $Path)) {
  Write-Error "File not found: $Path"
  exit 1
}

$content = Get-Content $Path -Raw

# Order matters: specific prefixed patterns first (hover:, focus:, placeholder:)
# then base patterns using (?<!:) lookbehind so we don't accidentally match inside
# already-prefixed classes like "hover:bg-X" or "dark:bg-X".
$pairs = @(
  # Hover prefixed (most specific first)
  @('\bhover:bg-gray-50\b(?!/)',      'hover:bg-gray-50 dark:hover:bg-slate-800'),
  @('\bhover:bg-gray-100\b',          'hover:bg-gray-100 dark:hover:bg-slate-800'),
  @('\bhover:bg-purple-50\b',         'hover:bg-purple-50 dark:hover:bg-purple-950/40'),
  @('\bhover:bg-red-50\b',            'hover:bg-red-50 dark:hover:bg-red-950/40'),
  @('\bhover:text-gray-600\b',        'hover:text-gray-600 dark:hover:text-slate-300'),
  @('\bhover:text-gray-900\b',        'hover:text-gray-900 dark:hover:text-slate-100'),
  @('\bhover:text-purple-600\b',      'hover:text-purple-600 dark:hover:text-purple-400'),
  @('\bhover:text-purple-700\b',      'hover:text-purple-700 dark:hover:text-purple-300'),
  @('\bhover:text-red-500\b',         'hover:text-red-500 dark:hover:text-red-400'),
  @('\bhover:border-purple-300\b',    'hover:border-purple-300 dark:hover:border-purple-700'),
  @('\bhover:border-purple-200\b',    'hover:border-purple-200 dark:hover:border-purple-800'),
  @('\bhover:shadow-sm\b',            'hover:shadow-sm dark:hover:shadow-black/40'),

  # Placeholder prefixed (both placeholder-* and placeholder:text-* syntax)
  @('\bplaceholder-gray-300\b',       'placeholder-gray-300 dark:placeholder-slate-600'),
  @('\bplaceholder-gray-400\b',       'placeholder-gray-400 dark:placeholder-slate-500'),
  @('\bplaceholder:text-gray-300\b',  'placeholder:text-gray-300 dark:placeholder:text-slate-600'),
  @('\bplaceholder:text-gray-400\b',  'placeholder:text-gray-400 dark:placeholder:text-slate-500'),
  @('\bplaceholder:text-gray-500\b',  'placeholder:text-gray-500 dark:placeholder:text-slate-400'),

  # Base classes — use (?<!:) lookbehind to skip already-prefixed occurrences
  @('(?<!:)\bbg-white\b',             'bg-white dark:bg-slate-900'),
  @('(?<!:)\bbg-gray-50/70\b',        'bg-gray-50/70 dark:bg-slate-800/60'),
  @('(?<!:)\bbg-gray-50\b(?!/)',      'bg-gray-50 dark:bg-slate-900/60'),
  @('(?<!:)\bbg-gray-100\b',          'bg-gray-100 dark:bg-slate-800'),
  @('(?<!:)\bbg-gray-300\b',          'bg-gray-300 dark:bg-slate-700'),
  @('(?<!:)\bbg-purple-50\b',         'bg-purple-50 dark:bg-purple-950/40'),
  @('(?<!:)\bbg-purple-100\b',        'bg-purple-100 dark:bg-purple-900/50'),

  @('(?<!:)\btext-gray-300\b',        'text-gray-300 dark:text-slate-600'),
  @('(?<!:)\btext-gray-400\b',        'text-gray-400 dark:text-slate-500'),
  @('(?<!:)\btext-gray-500\b',        'text-gray-500 dark:text-slate-400'),
  @('(?<!:)\btext-gray-600\b',        'text-gray-600 dark:text-slate-400'),
  @('(?<!:)\btext-gray-700\b',        'text-gray-700 dark:text-slate-300'),
  @('(?<!:)\btext-gray-800\b',        'text-gray-800 dark:text-slate-200'),
  @('(?<!:)\btext-gray-900\b',        'text-gray-900 dark:text-slate-100'),
  @('(?<!:)\btext-purple-600\b',      'text-purple-600 dark:text-purple-400'),
  @('(?<!:)\btext-purple-700\b',      'text-purple-700 dark:text-purple-300'),

  @('(?<!:)\bborder-gray-50\b',       'border-gray-50 dark:border-slate-800'),
  @('(?<!:)\bborder-gray-100\b',      'border-gray-100 dark:border-slate-800'),
  @('(?<!:)\bborder-gray-200\b',      'border-gray-200 dark:border-slate-700'),
  @('(?<!:)\bborder-gray-300\b',      'border-gray-300 dark:border-slate-600'),
  @('(?<!:)\bborder-gray-400\b',      'border-gray-400 dark:border-slate-500'),

  # Gradient helpers (from-white / to-gray-50)
  @('\bfrom-white\b',                 'from-white dark:from-slate-900'),
  @('\bto-gray-50\b',                 'to-gray-50 dark:to-slate-900/80'),
  @('\bvia-white\b',                  'via-white dark:via-slate-900'),
  @('\bvia-gray-50\b',                'via-gray-50 dark:via-slate-900/80')
)

foreach ($pair in $pairs) {
  $pattern = $pair[0]
  $replacement = $pair[1]
  $content = [regex]::Replace($content, $pattern, $replacement)
}

# Write back (preserving original encoding & no trailing newline injection)
Set-Content -Path $Path -Value $content -NoNewline
Write-Host "Added dark mode variants to $Path"
