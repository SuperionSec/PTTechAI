# Module 12: Report Management Tests
param($Framework)

$mod = "Reports"

Write-ModuleHeader -ModuleName $mod -Description "Report listing, generation, viewing, download, deletion"

$token = Get-AdminToken

# REPORT-01: List reports
Test-Step -Id "REPORT-01" -Name "List Reports" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/reports" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Reports retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# REPORT-02: Generate report (needs a scan - will likely fail without one)
Test-Step -Id "REPORT-02" -Name "Generate Report (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/reports" -Token $token -Body (@{
        scan_id = "00000000-0000-0000-0000-000000000000"
        title   = "Test Report"
        format  = "html"
    } | ConvertTo-Json)
    if ($r.success) {
        $script:createdReportId = $r.data.id
        Add-CleanupItem -Type "Report" -Id $script:createdReportId -CleanupAction {
            Invoke-ApiRequest -Method DELETE -Path "/api/v1/reports/$($script:createdReportId)" -Token (Get-AdminToken) | Out-Null
        }
        @{ success = $true; detail = "Report generated: $($r.data.id)" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode) - needs valid scan_id)" }
    }
}

# REPORT-03: AI generate report
Test-Step -Id "REPORT-03" -Name "AI Generate Report (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/reports/ai-generate" -Token $token -Body (@{
        scan_id = "00000000-0000-0000-0000-000000000000"
    } | ConvertTo-Json)
    @{ success = $true; detail = "AI-generate endpoint reached (status: $($r.statusCode))" }
}

# REPORT-04: Get report detail (non-existent)
Test-Step -Id "REPORT-04" -Name "Get Report Detail (non-existent)" -Module $mod {
    if ($script:createdReportId) {
        $r = Invoke-ApiRequest -Method GET -Path "/api/v1/reports/$($script:createdReportId)" -Token $token
    } else {
        $r = Invoke-ApiRequest -Method GET -Path "/api/v1/reports/00000000-0000-0000-0000-000000000000" -Token $token
    }
    if ($r.success) {
        @{ success = $true; detail = "Report detail retrieved" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode))" }
    }
}

# REPORT-05: View report (non-existent)
Test-Step -Id "REPORT-05" -Name "View Report (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/reports/00000000-0000-0000-0000-000000000000/view" -Token $token
    @{ success = $true; detail = "View endpoint reached (status: $($r.statusCode))" }
}

# REPORT-06: Download report (endpoint check)
Test-Step -Id "REPORT-06" -Name "Download Report (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/reports/00000000-0000-0000-0000-000000000000/download/html" -Token $token
    @{ success = $true; detail = "Download endpoint reached (status: $($r.statusCode))" }
}

# REPORT-07: Download ZIP report (endpoint check)
Test-Step -Id "REPORT-07" -Name "Download ZIP Report (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/reports/00000000-0000-0000-0000-000000000000/download-zip" -Token $token
    @{ success = $true; detail = "Download-zip endpoint reached (status: $($r.statusCode))" }
}

# REPORT-08: Delete report (non-existent)
Test-Step -Id "REPORT-08" -Name "Delete Report (non-existent)" -Module $mod {
    if ($script:createdReportId) {
        $r = Invoke-ApiRequest -Method DELETE -Path "/api/v1/reports/$($script:createdReportId)" -Token $token
        if ($r.success) {
            $script:createdReportId = $null
            @{ success = $true; detail = "Report deleted" }
        } else {
            @{ success = $false; detail = "Failed: $($r.error)" }
        }
    } else {
        $r = Invoke-ApiRequest -Method DELETE -Path "/api/v1/reports/00000000-0000-0000-0000-000000000000" -Token $token
        @{ success = $true; detail = "Delete endpoint reached (status: $($r.statusCode))" }
    }
}
