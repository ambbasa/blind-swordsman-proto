// fx-ink reference (OPTIONAL — the baked *-rim.png sheets need no shader). Tint rim from *-rimmask.png at runtime,
// e.g. pulse the zombie 귀기 before an attack (BRIEF 다음 수정 5: 공격 예비동작) without extra sheets.
// uniforms: map (original sheet), rimMask (same layout), uLine, uInner, uHaze (vec3), uK (0..1.5 pulse)
vec4 base = texture2D(map, vMapUv); vec3 m = texture2D(rimMask, vMapUv).rgb;
vec3 col = mix(base.rgb, uInner, m.g * 0.85 * uK);                        // inner moon rim on lit edges
float a = base.a;
col = mix(col, uHaze, m.b * (1.0 - a) * uK); a = max(a, m.b * uK * 0.6);   // haze outside the silhouette
col = mix(col, uLine, m.r * uK); a = max(a, m.r * uK);                     // outer line
gl_FragColor = vec4(col, a);
