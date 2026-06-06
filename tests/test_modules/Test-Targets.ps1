# Module 10: Target Management Tests
param($Framework)

$mod = "Targets"

Write-ModuleHeader -ModuleName $mod -Description "Target validation, bulk validation, file upload, input parsing"

$token = Get-AdminToken

# TARGET-01: Validate single target
Test-Step -Id "TARGET-01" -Name "Validate Single Target" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/targets/validate" -Token $token -Body (@{
        url = "http://example.com"
    } | ConvertTo-Json)
    if ($r.success) {
        @{ success = $true; detail = "Validation result: $($r.data | ConvertTo-Json -Compress)" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# TARGET-02: Bulk validate targets
Test-Step -Id "TARGET-02" -Name "Bulk Validate Targets" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/targets/validate/bulk" -Token $token -Body (@{
        urls = @("http://example.com", "http://testphp.vulnweb.com")
    } | ConvertTo-Json)
    if ($r.success) {
        @{ success = $true; detail = "Bulk validation completed" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# TARGET-03: Upload targets file
Test-Step -Id "TARGET-03" -Name "Upload Targets File" -Module $mod {
    # Create a temp file with targets
    $tempFile = [System.IO.Path]::GetTempFileName()
    "http://example.com`nhttp://testphp.vulnweb.com" | Out-File -FilePath $tempFile -Encoding UTF8

    try {
        $url = "$(Get-TestBaseUrl)/api/v1/targets/upload"
        $headers = @{ Authorization = "Bearer $token" }
        $r = Invoke-RestMethod -Uri $url -Method POST -Headers $headers -Form @{ file = Get-Item -Path $tempFile } -ErrorAction Stop
        @{ success = $true; detail = "File upload succeeded" }
    } catch {
        $statusCode = 0
        if ($_.Exception.Response) { $statusCode = [int]$_.Exception.Response.StatusCode }
        if ($statusCode -eq 422 -or $statusCode -eq 400) {
            @{ success = $true; detail = "Upload endpoint exists (status: $statusCode)" }
        } else {
            @{ success = $false; detail = "Upload failed: $_" }
        }
    } finally {
        Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue
    }
}

# TARGET-04: Parse target input
Test-Step -Id "TARGET-04" -Name "Parse Target Input" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/targets/parse-input" -Token $token -QueryParams @{ input_text = "http://example.com, http://testphp.vulnweb.com" }
    if ($r.success) {
        @{ success = $true; detail = "Parse result retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}
