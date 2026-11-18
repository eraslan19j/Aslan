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
	sun.shadow_enabled = true
	# ÖLÇÜLDÜ (v1, POCO X7 Pro): 180 m mesafede bina gölge kenarları tırtıklıydı.
	# 2048² harita / 180 m => texel ~8.8 cm, ama PSSM 4 split ile her split
	# daha da seyrek. Çözüm: mesafeyi 90 m'ye indir + tek split.
	sun.directional_shadow_max_distance = 90.0
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun.shadow_bias = 0.02
	sun.shadow_normal_bias = 0.8
	sun.shadow_blur = 1.6
	ProjectSettings.set_setting("rendering/lights_and_shadows/directional_shadow/size", size_px)
	ProjectSettings.set_setting(
		"rendering/lights_and_shadows/directional_shadow/soft_shadow_filter_quality", 3
	)


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
	var car_mesh := _make_car_mesh(seg)
	var car_tris := (car_mesh.surface_get_array_len(0)) / 3

	# Oyuncu aracı
	var player := MeshInstance3D.new()
	player.name = "PlayerCar"
	player.mesh = car_mesh
	player.position = Vector3(0, 0.75, 0)
	var pmat := StandardMaterial3D.new()
	pmat.albedo_color = Color(0.85, 0.72, 0.18)
	pmat.roughness = 0.35
	pmat.metallic = 0.35
	player.material_override = pmat
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
	mmi.material_override = pmat  # AYNI materyal — K8
	_content.add_child(mmi)

	_tri_total += car_tris * (count + 1)

	# Saydam cam — gerçek mobil katil (alpha blend overdraw)
	if with_glass:
		_tri_total += _build_glass(count)


func _build_glass(count: int) -> int:
	# 4 yan cam, her biri 2 üçgen
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	_make_quad(st, Vector3(-0.78, 0.72, 0.55), Vector3(-0.78, 0.72, -0.85), 0.42, true)
	_make_quad(st, Vector3(0.78, 0.72, 0.55), Vector3(0.78, 0.72, -0.85), 0.42, false)
	st.generate_normals()
	var glass_mesh := st.commit()

	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = glass_mesh
	mm.instance_count = count + 1
	for i in count + 1:
		mm.set_instance_transform(i, Transform3D(Basis.IDENTITY, Vector3(i * 4.0, 0.75, 0)))

	var mmi := MultiMeshInstance3D.new()
	mmi.name = "CarGlass"
	mmi.multimesh = mm
	# PROJE AYARINDAN BAĞIMSIZ saydamlık (v0.10.1 dersi)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.55, 0.68, 0.78, 0.42)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_PER_PIXEL
	mat.roughness = 0.12
	mat.metallic = 0.0
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mmi.material_override = mat
	_content.add_child(mmi)
	return 4 * (count + 1)


func _make_quad(st: SurfaceTool, a: Vector3, b: Vector3, height: float, flip: bool) -> void:
	var up := Vector3(0, height, 0)
	if flip:
		st.add_vertex(a)
		st.add_vertex(a + up)
		st.add_vertex(b + up)
		st.add_vertex(a)
		st.add_vertex(b + up)
		st.add_vertex(b)
	else:
		st.add_vertex(a)
		st.add_vertex(b + up)
		st.add_vertex(a + up)
		st.add_vertex(a)
		st.add_vertex(b)
		st.add_vertex(b + up)


# --- Araç mesh'i -----------------------------------------------------------
# seg: tekerlek radyal dilimi. 8 -> ~150 üçgen, 16 -> ~590 üçgen
func _make_car_mesh(seg: int) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	_append_box(st, Vector3(1.85, 0.62, 4.3), Vector3(0, 0, 0))
	_append_box(st, Vector3(1.6, 0.55, 2.1), Vector3(0, 0.58, -0.15))
	# 4 tekerlek
	var wx := 0.86
	var wz := 1.42
	for sx in [-1.0, 1.0]:
		for sz in [-1.0, 1.0]:
			_append_cylinder(
				st,
				Vector3(float(sx) * wx, -0.31, float(sz) * wz),
				0.34, 0.22, seg,
			)
	st.generate_normals()
	return st.commit()


func _append_box(st: SurfaceTool, size: Vector3, offset: Vector3) -> void:
	var h := size * 0.5
	var c := [
		Vector3(-h.x, -h.y, -h.z), Vector3(h.x, -h.y, -h.z),
		Vector3(h.x, -h.y, h.z), Vector3(-h.x, -h.y, h.z),
		Vector3(-h.x, h.y, -h.z), Vector3(h.x, h.y, -h.z),
		Vector3(h.x, h.y, h.z), Vector3(-h.x, h.y, h.z),
	]
	var faces := [
		[0, 2, 1], [0, 3, 2],
		[4, 5, 6], [4, 6, 7],
		[0, 1, 5], [0, 5, 4],
		[2, 3, 7], [2, 7, 6],
		[1, 2, 6], [1, 6, 5],
		[3, 0, 4], [3, 4, 7],
	]
	for f in faces:
		for idx in f:
			st.add_vertex(c[idx] + offset)


# Silindir: X ekseni etrafında döner (tekerlek yönü)
func _append_cylinder(st: SurfaceTool, center: Vector3, radius: float, width: float, seg: int) -> void:
	var half_w := width * 0.5
	# yan yüz
	for i in seg:
		var a0 := TAU * float(i) / float(seg)
		var a1 := TAU * float(i + 1) / float(seg)
		var y0 := cos(a0) * radius
		var z0 := sin(a0) * radius
		var y1 := cos(a1) * radius
		var z1 := sin(a1) * radius
		var p0 := center + Vector3(-half_w, y0, z0)
		var p1 := center + Vector3(half_w, y0, z0)
		var p2 := center + Vector3(half_w, y1, z1)
		var p3 := center + Vector3(-half_w, y1, z1)
		st.add_vertex(p0)
		st.add_vertex(p1)
		st.add_vertex(p2)
		st.add_vertex(p0)
		st.add_vertex(p2)
		st.add_vertex(p3)
	# kapaklar
	var cL := center + Vector3(-half_w, 0, 0)
	var cR := center + Vector3(half_w, 0, 0)
	for i in seg:
		var a0 := TAU * float(i) / float(seg)
		var a1 := TAU * float(i + 1) / float(seg)
		var y0 := cos(a0) * radius
		var z0 := sin(a0) * radius
		var y1 := cos(a1) * radius
		var z1 := sin(a1) * radius
		st.add_vertex(cL)
		st.add_vertex(cL + Vector3(0, y1, z1))
		st.add_vertex(cL + Vector3(0, y0, z0))
		st.add_vertex(cR)
		st.add_vertex(cR + Vector3(0, y0, z0))
		st.add_vertex(cR + Vector3(0, y1, z1))


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
