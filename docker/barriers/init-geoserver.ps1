param(
  [string]$GeoServerUrl = "http://localhost:8080/geoserver",
  [string]$AdminUser = "admin",
  [string]$AdminPass = "geoserver",
  [string]$Workspace = "security",
  [string]$DataStore = "security_postgis",
  [string]$LayerName = "barriers",
  [string]$DbHost = "postgis",             # Compose service name
  [string]$DbPort = "5432",
  [string]$DbName = "mapstore",
  [string]$DbUser = "mapstore",
  [string]$DbPass = "mapstore",
  [string]$FixedIcon = "$(Split-Path -Parent $MyInvocation.MyCommand.Path)\icons\fixed.png",
  [string]$MobileIcon = "$(Split-Path -Parent $MyInvocation.MyCommand.Path)\icons\mobile.png",
  [string]$SLDPath = "$(Split-Path -Parent $MyInvocation.MyCommand.Path)\Barriers.sld"
)

$pair = "$AdminUser:$AdminPass"
$B64  = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
$H    = @{ Authorization = "Basic $B64" }

Write-Host "Ensuring workspace '$Workspace'" -ForegroundColor Cyan
try { Invoke-RestMethod -Uri "$GeoServerUrl/rest/workspaces" -Method Post -Headers $H -ContentType "text/xml" -Body "<workspace><name>$Workspace</name></workspace>" -ErrorAction SilentlyContinue } catch {}

Write-Host "Creating PostGIS datastore '$DataStore' -> $DbHost:$DbPort/$DbName" -ForegroundColor Cyan
$ds = @"
<dataStore>
  <name>$DataStore</name>
  <connectionParameters>
    <entry key="dbtype">postgis</entry>
    <entry key="host">$DbHost</entry>
    <entry key="port">$DbPort</entry>
    <entry key="database">$DbName</entry>
    <entry key="schema">security</entry>
    <entry key="user">$DbUser</entry>
    <entry key="passwd">$DbPass</entry>
    <entry key="Expose primary keys">true</entry>
    <entry key="validate connections">true</entry>
  </connectionParameters>
</dataStore>
"@
Invoke-RestMethod -Uri "$GeoServerUrl/rest/workspaces/$Workspace/datastores" -Method Post -Headers $H -ContentType "text/xml" -Body $ds -ErrorAction SilentlyContinue

Write-Host "Publishing feature type '$LayerName'" -ForegroundColor Cyan
$ft = @"
<featureType>
  <name>$LayerName</name>
  <nativeName>barriers</nativeName>
  <title>Barriers</title>
  <srs>EPSG:4326</srs>
</featureType>
"@
Invoke-RestMethod -Uri "$GeoServerUrl/rest/workspaces/$Workspace/datastores/$DataStore/featuretypes" -Method Post -Headers $H -ContentType "text/xml" -Body $ft -ErrorAction SilentlyContinue

Write-Host "Uploading icons to data_dir/styles" -ForegroundColor Cyan
if (Test-Path $FixedIcon) {
  Invoke-RestMethod -Uri "$GeoServerUrl/rest/resource/styles/fixed.png" -Method Put -Headers ($H + @{"Content-Type"="image/png"}) -InFile $FixedIcon -ErrorAction SilentlyContinue
}
if (Test-Path $MobileIcon) {
  Invoke-RestMethod -Uri "$GeoServerUrl/rest/resource/styles/mobile.png" -Method Put -Headers ($H + @{"Content-Type"="image/png"}) -InFile $MobileIcon -ErrorAction SilentlyContinue
}

Write-Host "Preparing SLD at $SLDPath" -ForegroundColor Cyan
@'
<?xml version="1.0" encoding="UTF-8"?>
<sld:StyledLayerDescriptor xmlns="http://www.opengis.net/sld"
  xmlns:sld="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc"
  xmlns:gml="http://www.opengis.net/gml" version="1.0.0">
  <sld:NamedLayer>
    <sld:Name>Barriers</sld:Name>
    <sld:UserStyle>
      <sld:Title>Barriers by Category</sld:Title>
      <sld:FeatureTypeStyle>
        <sld:Rule>
          <sld:Name>حاجز ثابت</sld:Name>
          <ogc:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>category</ogc:PropertyName>
              <ogc:Literal>حاجز ثابت</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </ogc:Filter>
          <sld:PointSymbolizer>
            <sld:Graphic>
              <sld:ExternalGraphic>
                <sld:OnlineResource xlink:type="simple" xlink:href="fixed.png" xmlns:xlink="http://www.w3.org/1999/xlink"/>
                <sld:Format>image/png</sld:Format>
              </sld:ExternalGraphic>
              <sld:Size>32</sld:Size>
            </sld:Graphic>
          </sld:PointSymbolizer>
        </sld:Rule>
        <sld:Rule>
          <sld:Name>حاجز متحرك</sld:Name>
          <ogc:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>category</ogc:PropertyName>
              <ogc:Literal>حاجز متحرك</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </ogc:Filter>
          <sld:PointSymbolizer>
            <sld:Graphic>
              <sld:ExternalGraphic>
                <sld:OnlineResource xlink:type="simple" xlink:href="mobile.png" xmlns:xlink="http://www.w3.org/1999/xlink"/>
                <sld:Format>image/png</sld:Format>
              </sld:ExternalGraphic>
              <sld:Size>32</sld:Size>
            </sld:Graphic>
          </sld:PointSymbolizer>
        </sld:Rule>
      </sld:FeatureTypeStyle>
    </sld:UserStyle>
  </sld:NamedLayer>
</sld:StyledLayerDescriptor>
'@ | Set-Content -Encoding UTF8 $SLDPath

Write-Host "Creating style and uploading SLD" -ForegroundColor Cyan
Invoke-RestMethod -Uri "$GeoServerUrl/rest/workspaces/$Workspace/styles" -Method Post -Headers $H -ContentType "text/xml" -Body "<style><name>barriers</name><filename>Barriers.sld</filename></style>" -ErrorAction SilentlyContinue
Invoke-RestMethod -Uri "$GeoServerUrl/rest/workspaces/$Workspace/styles/barriers" -Method Put -Headers ($H + @{"Content-Type"="application/vnd.ogc.sld+xml"}) -InFile $SLDPath -ErrorAction SilentlyContinue

Write-Host "Setting default style on the layer" -ForegroundColor Cyan
Invoke-RestMethod -Uri "$GeoServerUrl/rest/layers/$Workspace:$LayerName" -Method Put -Headers $H -ContentType "text/xml" -Body "<layer><defaultStyle><name>$Workspace:barriers</name></defaultStyle></layer>" -ErrorAction SilentlyContinue

Write-Host "Enabling WFS-T globally" -ForegroundColor Cyan
$wfs = @"
<wfs>
  <id>wfs</id>
  <enabled>true</enabled>
  <serviceLevel>TRANSACTIONAL</serviceLevel>
</wfs>
"@
Invoke-RestMethod -Uri "$GeoServerUrl/rest/services/wfs/settings" -Method Put -Headers $H -ContentType "text/xml" -Body $wfs -ErrorAction SilentlyContinue

Write-Host "Done. Preview WMS: $GeoServerUrl/web/" -ForegroundColor Green
