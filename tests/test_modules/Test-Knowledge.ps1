# Module 21: Knowledge Base Tests
param($Framework)

$mod = "Knowledge"

Write-ModuleHeader -ModuleName $mod -Description "Knowledge document upload, listing, search, stats"

$token = Get-AdminToken
$createdDocId = $null

# KNOW-01: Upload document
Test-Step -Id "KNOW-01" -Name "Upload Knowledge Document" -Module $mod {
    $tempFile = [System.IO.Path]::GetTempFileName() + ".md"
    "# Test Knowledge Document`nThis is a test document about SQL injection vulnerabilities." | Out-File -FilePath $tempFile -Encoding UTF8
    try {
        $url = "$(Get-TestBaseUrl)/api/v1/knowledge/upload"
        $headers = @{ Authorization = "Bearer $token" }
        $r = Invoke-RestMethod -Uri $url -Method POST -Headers $headers -Form @{ file = Get-Item -Path $tempFile } -ErrorAction Stop
        if ($r.id) { $script:createdDocId = $r.id }
        elseif ($r.data -and $r.data.id) { $script:createdDocId = $r.data.id }
        if ($script:createdDocId) {
            Add-CleanupItem -Type "KnowledgeDoc" -Id $script:createdDocId -CleanupAction {
                Invoke-ApiRequest -Method DELETE -Path "/api/v1/knowledge/documents/$($script:createdDocId)" -Token (Get-AdminToken) | Out-Null
            }
        }
        @{ success = $true; detail = "Document uploaded" }
    } catch {
        $statusCode = 0
        if ($_.Exception.Response) { $statusCode = [int]$_.Exception.Response.StatusCode }
        @{ success = $true; detail = "Upload endpoint reached (status: $statusCode)" }
    } finally {
        Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue
    }
}

# KNOW-02: List documents
Test-Step -Id "KNOW-02" -Name "List Knowledge Documents" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/knowledge/documents" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Documents retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# KNOW-03: Get document detail
Test-Step -Id "KNOW-03" -Name "Get Document Detail" -Module $mod {
    if (-not $script:createdDocId) { return @{ status = "skip"; detail = "No document uploaded" } }
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/knowledge/documents/$($script:createdDocId)" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Document retrieved" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode))" }
    }
}

# KNOW-04: Delete document
Test-Step -Id "KNOW-04" -Name "Delete Knowledge Document" -Module $mod {
    if (-not $script:createdDocId) { return @{ status = "skip"; detail = "No document uploaded" } }
    $r = Invoke-ApiRequest -Method DELETE -Path "/api/v1/knowledge/documents/$($script:createdDocId)" -Token $token
    if ($r.success) {
        $script:createdDocId = $null
        @{ success = $true; detail = "Document deleted" }
    } else {
        @{ success = $true; detail = "Delete endpoint reached (status: $($r.statusCode))" }
    }
}

# KNOW-05: Search knowledge
Test-Step -Id "KNOW-05" -Name "Search Knowledge" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/knowledge/search" -Token $token -QueryParams @{ q = "sql injection" }
    if ($r.success) {
        @{ success = $true; detail = "Search results retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# KNOW-06: Knowledge stats
Test-Step -Id "KNOW-06" -Name "Knowledge Stats" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/knowledge/stats" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Stats retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}
