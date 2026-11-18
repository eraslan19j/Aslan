# PrototypeWorld — Faz 0.5 ölçüm sahnesi (v2: yoğunluk merdiveni)
#
# NEDEN v2:
#   v1 sahnesi 362 üçgendi ve telefonda 113 FPS verdi. Ama POCO X7 Pro
#   120 Hz olduğu için 113 FPS = 8.85 ms ≈ ekran tavanı. Yani GPU'nun
#   NE KADAR gücü kaldığını göremedik. 362 üçgen gerçek dünyanın
#   ~1/1650'i. O ölçüm bir şey kanıtlamıyor.
#
# v2: tek APK içinde 4 yoğunluk seviyesi. Ekrandaki butonlarla geçilir.
#   L0 Boş     ~360 üçgen      (v1 ile aynı — referans)
#   L1 Mahalle ~25.000 üçgen   (gerçek dünyanın 1/24'ü)
#   L2 Yoğun   ~120.000 üçgen  (1/5'i)
#   L3 Hedef   ~500.000 üçgen  (gerçek hedefe yakın)
#
# Her seviyede ölçülen: FPS, kare süresi, draw call, üçgen, nesne.
# Amaç: FPS'in hangi seviyede 30'un altına düştüğünü GÖRMEK.
#
# K8 kuralı korunuyor: oyuncu ve NPC araçları AYNI mesh'i kullanır.

extends Node3D

const TILE_SIZE := 400.0

# --- Yoğunluk seviyeleri ---------------------------------------------------
# bina: adet · b_sub: kutu alt bölmesi (0->12, 1->48, 2->108 üçgen)
# araç: adet · car_seg: tekerlek radyal dilimi (8->~150, 16->~590 üçgen)
# cam: saydam cam açık mı (overdraw testi)
# gölge: yönlü ışık gölge haritası boyutu (0 = kapalı)
const LEVELS: Array[Dictionary] = [
	{
		"name": "L0 Bos",
		"buildings": 12, "b_sub": 0,
		"cars": 8, "car_seg": 8,
		"glass": false, "shadow": 2048,
	},
	{
		"name": "L1 Mahalle",
		"buildings": 150, "b_sub": 1,
		"cars": 40, "car_seg": 8,
		"glass": true, "shadow": 2048,
	},
	{
		"name": "L2 Yogun",
		"buildings": 600, "b_sub": 2,
		"cars": 100, "car_seg": 12,
		"glass": true, "shadow": 2048,
	},
	{
		"name": "L3 Hedef",
		"buildings": 1400, "b_sub": 2,
		"cars": 200, "car_seg": 16,
		"glass": true, "shadow": 2048,
	},
]

var _level := 0
var _elapsed := 0.0
var _car_transforms: Array[Transform3D] = []
var _car_count := 0
var _content: Node3D
var _tri_total := 0
var _level_label: Label


func _ready() -> void:
	_build_ui()
	_load_level(0)


func get_level_name() -> String:
	return LEVELS[_level]["name"]


func get_tri_total() -> int:
	return _tri_total


# --- Seviye yükleme --------------------------------------------------------
func _load_level(idx: int) -> void:
	_level = clampi(idx, 0, LEVELS.size() - 1)
	_elapsed = 0.0
	_tri_total = 0

	if _content != null and is_instance_valid(_content):
		_content.queue_free()
	_content = Node3D.new()
	_content.name = "LevelContent"
	add_child(_content)

	var cfg: Dictionary = LEVELS[_level]
	_apply_shadow(int(cfg["shadow"]))
	_build_ground()
	_build_buildings(int(cfg["buildings"]), int(cfg["b_sub"]))
	_build_vehicles(int(cfg["cars"]), int(cfg["car_seg"]), bool(cfg["glass"]))

	if _level_label != null:
		_level_label.text = "%s — %s üçgen" % [str(cfg["name"]), _fmt(_tri_total)]
	print("[PrototypeWorld] seviye=%s üçgen=%d" % [str(cfg["name"]), _tri_total])


func _apply_shadow(size_px: int) -> void:
	var sun := get_parent().get_node_or_null("Sun") as DirectionalLight3D
	if sun == null:
		return
	if size_px <= 0:
		sun.shadow_enabled = false
		return

	# ÖLÇÜLDÜ (v0.10.1, POCO X7 Pro): gölge hâlâ tırtıklıydı.
	# Sebep: directional_shadow_mode / shadow_blur / soft_shadow_filter_quality
	# PROJE AYARIDIR — _ready()'de değiştirmek çalışma anında etkisiz.
	# Çalışma anında geçerli olan tek şey project.godot'tur; bu yüzden
	# doğru değerler oraya yazıldı (rendering/lights_and_shadows/*).
	#
	# Burada yalnızca ışığın kendi özellikleri ayarlanır:
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 120.0
	sun.shadow_bias = 0.025
	sun.shadow_normal_bias = 1.0
	sun.shadow_blur = 2.0
	sun.directional_shadow_fade_start = 0.85
	# 2 split: tek geçişte daha yüksek texel yoğunluğu (4 split'te her split seyrek)
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS


# --- Zemin -----------------------------------------------------------------
func _build_ground() -> void:
	var plane := PlaneMesh.new()
	plane.size = Vector2(TILE_SIZE, TILE_SIZE)
	# Hedef dünyada arazi bölünmüş olur; burada 32x32 = 2048 üçgen
	plane.subdivide_width = 31
	plane.subdivide_depth = 31
	var mi := MeshInstance3D.new()
	mi.name = "Ground"
	mi.mesh = plane
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.28, 0.29, 0.3)
	mat.roughness = 0.92
	mi.material_override = mat
	_content.add_child(mi)
	_tri_total += 31 * 31 * 2


# --- Binalar ---------------------------------------------------------------
func _build_buildings(count: int, sub: int) -> void:
	var box := BoxMesh.new()
	box.size = Vector3(1, 1, 1)
	box.subdivide_width = sub
	box.subdivide_depth = sub
	box.subdivide_height = sub

	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = box
	mm.instance_count = count

	var rng := RandomNumberGenerator.new()
	rng.seed = 1337  # deterministik — Math.random() yasak kuralı

	var half := TILE_SIZE * 0.42
	for i in count:
		var w := rng.randf_range(9.0, 24.0)
		var d := rng.randf_range(9.0, 24.0)
		var h := rng.randf_range(6.0, 26.0)
		var px := rng.randf_range(-half, half)
		var pz := rng.randf_range(-half, half)
		var basis := Basis.IDENTITY.scaled(Vector3(w, h, d))
		mm.set_instance_transform(i, Transform3D(basis, Vector3(px, h * 0.5, pz)))

	var mmi := MultiMeshInstance3D.new()
	mmi.name = "Buildings"
	mmi.multimesh = mm
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.62, 0.58, 0.52)
	mat.roughness = 0.85
	mmi.material_override = mat
	_content.add_child(mmi)

	# Kutu üçgen sayısı: her yüz (sub+1)^2 kuad = 2*(sub+1)^2 üçgen, 6 yüz
	var per_box := 6 * 2 * (sub + 1) * (sub + 1)
	_tri_total += per_box * count


# --- Araçlar (TEK mesh — oyuncu ve NPC aynı, K8) ---------------------------
func _build_vehicles(count: int, seg: int, with_glass: bool) -> void:
	var car_mesh := _make_vehicle_mesh(seg)
	var car_tris := 0
	for si in car_mesh.get_surface_count():
		car_tris += car_mesh.surface_get_array_len(si) / 3

	# Oyuncu aracı — materyaller mesh'in KENDİ yüzeylerinde.
	# DİKKAT: material_override KULLANILMAZ; kullanılırsa tüm yüzeyleri
	# tek materyale çevirir ve cam saydamlığını öldürür (eski H1 hatası).
	var player := MeshInstance3D.new()
	player.name = "PlayerCar"
	player.mesh = car_mesh
	player.position = Vector3(0, 0.75, 0)
	_content.add_child(player)

	# NPC araçları — AYNI mesh
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = car_mesh
	mm.instance_count = count
	_car_transforms.clear()
	_car_count = count
	for i in count:
		var t := Transform3D(Basis.IDENTITY, Vector3(i * 4.0, 0.75, 0))
		mm.set_instance_transform(i, t)
		_car_transforms.append(t)

	var mmi := MultiMeshInstance3D.new()
	mmi.name = "NPCVehicles"
	mmi.multimesh = mm
	# material_override YOK — mesh yüzey materyalleri kullanılır.
	# Böylece NPC'lerde de cam saydam (K8: aynı materyal kuralları).
	_content.add_child(mmi)

	_tri_total += car_tris * (count + 1)

	# Cam artık gövde mesh'inin ikinci yüzeyi (tek cam materyali kuralı).
	# with_glass = false ise LOD2'de cam hiç üretilmez — burada seg=0 ile yapılır.
	if not with_glass:
		pass


# --- Araç mesh'i: TEK TANIM (VehicleDef) ---
# K8 kuralı: oyuncu ve NPC AYNI fonksiyondan üretilir.
# İkinci bir üretici (create_player_rig / build_traffic_mesh) YOKTUR.
var _body_mat: StandardMaterial3D
var _glass_mat: StandardMaterial3D


func _car_materials() -> void:
	if _body_mat != null:
		return
	_body_mat = StandardMaterial3D.new()
	_body_mat.albedo_color = Color(0.85, 0.72, 0.18)
	_body_mat.roughness = 0.28
	_body_mat.metallic = 0.45
	_body_mat.clearcoat_enabled = true
	_body_mat.clearcoat = 0.6
	_body_mat.clearcoat_roughness = 0.2

	# TEK cam materyali — NPC'lerde de bu kullanılır (eski hatanın düzeltmesi)
	_glass_mat = StandardMaterial3D.new()
	_glass_mat.albedo_color = Color(0.42, 0.56, 0.68, 0.38)
	_glass_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_glass_mat.roughness = 0.08
	_glass_mat.metallic = 0.0
	_glass_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	_glass_mat.rim_enabled = true
	_glass_mat.rim = 0.4


# segment: tekerlek radyal dilimi. 0 -> tekerlek yok (LOD2)
func _make_vehicle_mesh(seg: int) -> ArrayMesh:
	_car_materials()
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	VehicleDef.build_body(st)
	st.generate_normals()
	st.set_material(_body_mat)
	var body := st.commit()

	if seg <= 0:
		return body

	# Cam ayrı yüzey (farklı materyal)
	var gs := SurfaceTool.new()
	gs.begin(Mesh.PRIMITIVE_TRIANGLES)
	VehicleDef.build_glass(gs)
	gs.generate_normals()
	gs.set_material(_glass_mat)
	var glass := gs.commit()

	# Tekerlekler ayrı yüzey (koyu kauçuk)
	var ws := SurfaceTool.new()
	ws.begin(Mesh.PRIMITIVE_TRIANGLES)
	for wp in VehicleDef.wheel_positions():
		VehicleDef.build_wheel(ws, wp, seg)
	ws.generate_normals()
	var rubber := StandardMaterial3D.new()
	rubber.albedo_color = Color(0.07, 0.07, 0.08)
	rubber.roughness = 0.95
	ws.set_material(rubber)
	var wheels := ws.commit()

	# Üç yüzeyi tek ArrayMesh'te birleştir
	var out := ArrayMesh.new()
	for m in [body, glass, wheels]:
		for si in m.get_surface_count():
			out.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, m.surface_get_arrays(si))
			out.surface_set_material(out.get_surface_count() - 1, m.surface_get_material(si))
	return out


# --- Animasyon -------------------------------------------------------------
func _process(delta: float) -> void:
	_elapsed += delta
	if _content == null or not is_instance_valid(_content):
		return
	var mmi := _content.get_node_or_null("NPCVehicles") as MultiMeshInstance3D
	if mmi == null:
		return
	var mm := mmi.multimesh
	if mm == null or _car_count == 0:
		return
	# Sadece ilk 48 aracı hareket ettir (200 araçta GDScript maliyeti
	# ölçümü kirletmesin — gerçek oyunda bu iş C++ tarafında)
	var moving: int = mini(_car_count, 48)
	for i in moving:
		var a := _elapsed * 0.28 + TAU * float(i) / float(moving)
		var r := 40.0 + float(i % 5) * 26.0
		mm.set_instance_transform(
			i,
			Transform3D(
				Basis(Vector3.UP, -a),
				Vector3(cos(a) * r, 0.75, sin(a) * r),
			),
		)


# --- UI --------------------------------------------------------------------
func _build_ui() -> void:
	var canvas := CanvasLayer.new()
	canvas.name = "LevelUI"
	add_child(canvas)

	var box := HBoxContainer.new()
	box.position = Vector2(24, 76)
	box.add_theme_constant_override("separation", 10)
	canvas.add_child(box)

	for i in LEVELS.size():
		var b := Button.new()
		b.text = str(LEVELS[i]["name"])
		b.add_theme_font_size_override("font_size", 20)
		b.custom_minimum_size = Vector2(150, 48)
		var idx := i
		b.pressed.connect(func() -> void: _load_level(idx))
		box.add_child(b)

	_level_label = Label.new()
	_level_label.position = Vector2(24, 136)
	_level_label.add_theme_font_size_override("font_size", 20)
	_level_label.add_theme_color_override("font_color", Color(0.55, 1.0, 0.6))
	_level_label.add_theme_color_override("font_outline_color", Color(0, 0, 0))
	_level_label.add_theme_constant_override("outline_size", 6)
	canvas.add_child(_level_label)


func _fmt(n: int) -> String:
	if n >= 1000000:
		return "%.1fM" % (float(n) / 1000000.0)
	if n >= 1000:
		return "%.1fk" % (float(n) / 1000.0)
	return str(n)
