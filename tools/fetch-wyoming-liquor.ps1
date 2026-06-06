param(
  [string]$CategoryUrl = "https://liquor365.wyo.gov/wld/distilled-spirits/whiskey-domestic/5637145409.c",
  [string]$Out = "data/raw/wyoming-liquor/whiskey-domestic-products.json",
  [int]$PageSize = 24,
  [int]$DelayMilliseconds = 150
)

$ErrorActionPreference = "Stop"

function ConvertTo-NumberOrNull {
  param([string]$Value)

  $clean = ([System.Net.WebUtility]::HtmlDecode([string]$Value) -replace "[$,]", "").Trim()
  if (-not $clean) { return $null }

  $parsed = 0.0
  if ([double]::TryParse($clean, [ref]$parsed)) { return $parsed }
  return $null
}

function Decode-Text {
  param([string]$Value)
  return ([System.Net.WebUtility]::HtmlDecode([string]$Value) -replace "\s+", " ").Trim()
}

function First-Group {
  param(
    [string]$Text,
    [string]$Pattern,
    [string]$GroupName = "value"
  )

  $match = [regex]::Match($Text, $Pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if (-not $match.Success) { return $null }
  return $match.Groups[$GroupName].Value
}

$headers = @{
  "User-Agent" = "Barrel Proof source catalog importer"
}

$startedAt = (Get-Date).ToUniversalTime().ToString("o")
$products = New-Object System.Collections.Generic.List[object]
$totalProductCount = $null
$pagesFetched = 0

for ($skip = 0; ; $skip += $PageSize) {
  $url = if ($skip -eq 0) { $CategoryUrl } else { "${CategoryUrl}?skip=$skip" }
  Write-Host "Fetching $url"

  $html = [string](Invoke-WebRequest -Uri $url -UseBasicParsing -Headers $headers).Content
  $pagesFetched += 1

  if ($null -eq $totalProductCount) {
    $countMatch = [regex]::Match($html, '"totalProductCount":(?<count>\d+)')
    if ($countMatch.Success) {
      $totalProductCount = [int]$countMatch.Groups["count"].Value
    }
  }

  $rowMatches = [regex]::Matches(
    $html,
    '<tr class="list-view__table__row(?:__shaded)?">(?<row>.*?)</tr>',
    [System.Text.RegularExpressions.RegexOptions]::Singleline
  )

  foreach ($rowMatch in $rowMatches) {
    $row = $rowMatch.Groups["row"].Value
    $itemId = Decode-Text (First-Group $row '</td><td>(?<value>[^<]+)</td><td class="list-view__productName">')
    $href = Decode-Text (First-Group $row '<td class="list-view__productName"><a href="(?<href>[^"]+)">(?<name>.*?)</a></td>' "href")
    $name = Decode-Text (First-Group $row '<td class="list-view__productName"><a href="(?<href>[^"]+)">(?<name>.*?)</a></td>' "name")
    $availability = Decode-Text (First-Group $row '<div class="list-view__centre-justify">(?<value>[^<]*)</div>')
    $priceText = Decode-Text (First-Group $row 'itemProp="price">(?<value>[^<]+)</span>')
    $recordId = First-Group $href '/(?<value>\d+)\.p$'

    if (-not $itemId -or -not $name) { continue }

    $products.Add([ordered]@{
      itemId = $itemId
      recordId = $recordId
      name = $name
      href = $href
      productUrl = if ($href -like "http*") { $href } else { "https://liquor365.wyo.gov$href" }
      availability = $availability
      listPrice = ConvertTo-NumberOrNull $priceText
      listPriceText = $priceText
      sourcePageUrl = $url
      sourceCategoryUrl = $CategoryUrl
      sourceSkip = $skip
      retrievedAt = $startedAt
    })
  }

  if ($null -ne $totalProductCount -and ($skip + $PageSize) -ge $totalProductCount) { break }
  if ($rowMatches.Count -eq 0) { break }
  if ($DelayMilliseconds -gt 0) { Start-Sleep -Milliseconds $DelayMilliseconds }
}

$payload = [ordered]@{
  schemaVersion = 1
  source = [ordered]@{
    id = "wyoming_liquor_division"
    name = "Wyoming Liquor Division Liquor365 Domestic Whiskey Catalog"
    url = $CategoryUrl
    region = "WY"
    sourceType = "control_state_catalog"
  }
  retrievedAt = $startedAt
  categoryUrl = $CategoryUrl
  pageSize = $PageSize
  pagesFetched = $pagesFetched
  totalProductCount = $totalProductCount
  rawProductCount = $products.Count
  products = $products
}

$outPath = Resolve-Path -LiteralPath (Split-Path -Parent $Out) -ErrorAction SilentlyContinue
if (-not $outPath) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Out) | Out-Null
}

$json = $payload | ConvertTo-Json -Depth 8
$encoding = New-Object System.Text.UTF8Encoding($false)
$resolvedOut = if (Test-Path -LiteralPath $Out) {
  (Resolve-Path -LiteralPath $Out).Path
} else {
  [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $Out))
}
[System.IO.File]::WriteAllText($resolvedOut, $json + [Environment]::NewLine, $encoding)
Write-Host "Wrote $($products.Count) Wyoming Liquor product rows to $Out"
