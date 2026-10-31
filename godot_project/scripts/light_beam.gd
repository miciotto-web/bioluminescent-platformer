extends Area2D
class_name LightBeam

@export var speed: float = 620.0
@export var damage: int = 1
@export var lifetime: float = 1.15

var direction: int = 1

func setup(dir: int) -> void:
	direction = dir

func _ready() -> void:
	body_entered.connect(_on_body_entered)
	area_entered.connect(_on_area_entered)

func _physics_process(delta: float) -> void:
	global_position.x += direction * speed * delta
	lifetime -= delta
	if lifetime <= 0.0:
		queue_free()

func _on_body_entered(body: Node) -> void:
	if body.has_method("take_light_damage"):
		body.call("take_light_damage", damage)
	_spawn_hit_burst()
	queue_free()

func _on_area_entered(area: Area2D) -> void:
	if area.has_method("apply_purification"):
		area.call("apply_purification", 28.0)
		_spawn_hit_burst()
		queue_free()

func _spawn_hit_burst() -> void:
	# Emits luminous hit flash particles before freeing
	pass
