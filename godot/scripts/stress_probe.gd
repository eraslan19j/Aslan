# StressProbe — v0.11.0 gerçek darboğaz testi
#
# NEDEN:
#   v0.10.1 yoğunluk merdiveni şunu kanıtladı [ölçüldü]:
#     619k üçgen eklemek sadece 0.46 ms  =>  üçgen SERBEST
#   Ama L0 bile 8.58 ms = 116 FPS, yani 120 Hz tavanı. GPU hiç zorlanmadı.
#   Üçgen testi bitti; sıradaki iki şüpheli: DOLGU ve CPU.
#
# BU TEST NE YAPAR:
#   A. DOLGU: ekranı kaplayan saydam katman sayısı (overdraw) 0..12 arası.
#      Her katman tam ekran alpha-blend = mobil GPU'ların en pahalı işi.
#   B. CPU: her karede yapılan skaler iş yükü (NPC benzetimi yerine).
#      Gerçek oyunda 30 araç + 40 yaya AI'ı bu sınıfa girer.
#   C. GÖLGE: gölge geçişini kapatıp farkı ölç (fill maliyeti).
#
# KULLANIM: butonlarla artır/azalt. Her adımda 10 sn bekle, 3 parmakla rapor al.

extends Node

const FILL_MAX := 12
const FILL_STEP := 2
const CPU_MAX_K := 2000     # 2000 x 1000 iterasyon/extrapolation
const CPU_STEP_K := 250

var _fill_layers := 0
var _cpu_k := 0
var _shadow_on := true

var _fill_root: Node3D
var _fill_mat: StandardMaterial3D
var _fill_quads: Array[MeshInstance3D] = []

var _cpu_acc := 0.0
var _fill_label: Label
var _cpu_label: Label
var _shadow_label: Label


func _ready() -> void:
	var canvas := CanvasLayer.new()
	canvas.name = "StressUI"
	add_child(canvas)

	# --- DOLGU (overdraw) ---
	# Düzlemler KAMERAYA eklenir; böylece her zaman ekranı kaplarlar.
	_fill_root = Node3D.new()
	_fill_root.name = "FillLayers"
	var cam := get_parent().get_node_or_null("Camera3D") as Camera3D
	if cam != null:
		cam.add_child(_fill_root)
	else:
		add_child(_fill_root)

	# Tam ekran ölçekli, kameraya yapışık düzlemler.
	# Saydam + derinlik yazmayan => her katman tüm pikselleri yeniden boyar.
	_fill_mat = StandardMaterial3D.new()
	_fill_mat.albedo_color = Color(0.99, 0.35, 0.1, 0.16)
	_fill_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_fill_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_fill_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	_fill_mat.disable_ambient_light = true
	_fill_mat.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED

	for i in FILL_MAX:
		var q := MeshInstance3D.new()
		var pm := QuadMesh.new()
		pm.size = Vector2(2.0, 2.0)
		q.mesh = pm
		q.material_override = _fill_mat
		q.visible = false
		# Kameranın hemen önünde, kademeli derinlikte
		q.position = Vector3(0, 0, -0.6 - float(i) * 0.01)
		q.extra_cull_margin = 16384.0
		_fill_root.add_child(q)
		_fill_quads.append(q)

	_build_ui()
	_apply()


func _build_ui() -> void:
	var canvas := get_node("StressUI") as CanvasLayer
	var v := VBoxContainer.new()
	v.position = Vector2(24, 176)
	v.add_theme_constant_override("separation", 6)
	canvas.add_child(v)

	var h1 := HBoxContainer.new()
	h1.add_theme_constant_override("separation", 8)
	v.add_child(h1)
	_add_btn(h1, "Dolgu -", func() -> void: _fill_layers = maxi(0, _fill_layers - FILL_STEP); _apply())
	_add_btn(h1, "Dolgu +", func() -> void: _fill_layers = mini(FILL_MAX, _fill_layers + FILL_STEP); _apply())
	_fill_label = _add_lbl(h1)

	var h2 := HBoxContainer.new()
	h2.add_theme_constant_override("separation", 8)
	v.add_child(h2)
	_add_btn(h2, "CPU -", func() -> void: _cpu_k = maxi(0, _cpu_k - CPU_STEP_K); _apply())
	_add_btn(h2, "CPU +", func() -> void: _cpu_k = mini(CPU_MAX_K, _cpu_k + CPU_STEP_K); _apply())
	_cpu_label = _add_lbl(h2)

	var h3 := HBoxContainer.new()
	h3.add_theme_constant_override("separation", 8)
	v.add_child(h3)
	_add_btn(h3, "Gölge Aç/Kapa", func() -> void: _shadow_on = not _shadow_on; _apply())
	_shadow_label = _add_lbl(h3)


func _add_btn(parent: Node, text: String, cb: Callable) -> void:
	var b := Button.new()
	b.text = text
	b.add_theme_font_size_override("font_size", 19)
	b.custom_minimum_size = Vector2(140, 46)
	b.pressed.connect(cb)
	parent.add_child(b)


func _add_lbl(parent: Node) -> Label:
	var l := Label.new()
	l.add_theme_font_size_override("font_size", 20)
	l.add_theme_color_override("font_color", Color(0.6, 0.95, 1.0))
	l.add_theme_color_override("font_outline_color", Color(0, 0, 0))
	l.add_theme_constant_override("outline_size", 6)
	l.custom_minimum_size = Vector2(300, 0)
	parent.add_child(l)
	return l


func _apply() -> void:
	for i in FILL_MAX:
		_fill_quads[i].visible = i < _fill_layers

	var sun := get_parent().get_node_or_null("Sun") as DirectionalLight3D
	if sun != null:
		sun.shadow_enabled = _shadow_on

	if _fill_label != null:
		_fill_label.text = "dolgu: %d katman" % _fill_layers
	if _cpu_label != null:
		_cpu_label.text = "CPU: %dk işlem/kare" % _cpu_k
	if _shadow_label != null:
		_shadow_label.text = "gölge: %s" % ("AÇIK" if _shadow_on else "KAPALI")


func get_stress() -> Dictionary:
	return {
		"fill_layers": _fill_layers,
		"cpu_k": _cpu_k,
		"shadow": _shadow_on,
	}


func _process(_dt: float) -> void:
	# CPU yükü: kare başına _cpu_k * 1000 skaler işlem.
	# Gerçek oyunda NPC AI + trafik mantığı bu sınıfa girer.
	if _cpu_k > 0:
		var acc := 0.0
		var n := _cpu_k * 1000
		for i in n:
			acc += sqrt(float(i) + 1.0) * 0.5
		_cpu_acc += acc
