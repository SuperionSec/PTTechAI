# Module 8: Dashboard Tests
param($Framework)

$mod = "Dashboard"

Write-ModuleHeader -ModuleName $mod -Description "Dashboard statistics and activity data"

$token = Get-AdminToken

$dashboardEndpoints = @(
    @{ Id = "DASH-01"; Name = "Dashboard Stats"; Path = "/api/v1/dashboard/stats" },
    @{ Id = "DASH-02"; Name = "Recent Activity"; Path = "/api/v1/dashboard/recent" },
    @{ Id = "DASH-03"; Name = "Recent Findings"; Path = "/api/v1/dashboard/findings" },
    @{ Id = "DASH-04"; Name = "Vulnerability Types Distribution"; Path = "/api/v1/dashboard/vulnerability-types" },
    @{ Id = "DASH-05"; Name = "Scan History"; Path = "/api/v1/dashboard/scan-history" },
    @{ Id = "DASH-06"; Name = "Recent Agent Tasks"; Path = "/api/v1/dashboard/agent-tasks" },
    @{ Id = "DASH-07"; Name = "Activity Feed"; Path = "/api/v1/dashboard/activity-feed" }
)

foreach ($ep in $dashboardEndpoints) {
    Test-Step -Id $ep.Id -Name $ep.Name -Module $mod {
        $r = Invoke-ApiRequest -Method GET -Path $ep.Path -Token $token
        if ($r.success) {
            @{ success = $true; detail = "Data retrieved successfully" }
        } else {
            @{ success = $false; detail = "Status $($r.statusCode): $($r.error)" }
        }
    }
}
