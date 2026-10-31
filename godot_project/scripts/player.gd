extends CharacterBody2D
class_name PlayerCreature

signal health_changed(current_hp: int, max_hp: int)
signal player_died()

@export var max_speed: float = 295.0
@export var acceleration: float = 1650.0
@export var deceleration: float = 1950.0
@export var jump_velocity: float = -545.0
@export var gravity_scale: float = 1380.0
@export var max_hp: int = 5

@onready var light_system: LightSystem = $LightSystem
@onready var point_light: PointLight2D = $PointLight2D
@onready var anim_sprite: Node2D = $VisualRoot

var current_hp: int = max_hp
var facing: int = 1
var attack_cooldown: float = 0.0
var attack_anim_timer: float = 0.0
var hurt_flash_timer: float = 0.0
var invuln_timer: float = 0.0
var current_anim_state: String = "idle"
var light_beam_scene: PackedScene = preload("res://scenes/light_beam.tscn")

func _ready() -> void:
	current_hp = max_hp
	health_changed.emit(current_hp, max_hp)

func _physics_process(delta: float) -> void:
	if attack_cooldown > 0.0:
		attack_cooldown = maxf(0.0, attack_cooldown - delta)
	if attack_anim_timer > 0.0:
		attack_anim_timer = maxf(0.0, attack_anim_timer - delta)
	if hurt_flash_timer > 0.0:
		hurt_flash_timer = maxf(0.0, hurt_flash_timer - delta)
	if invuln_timer > 0.0:
		invuln_timer = maxf(0.0, invuln_timer - delta)

	# Gravity
	if not is_on_floor():
		velocity.y += gravity_scale * delta

	# Jump
	if Input.is_action_just_pressed("move_jump") and is_on_floor():
		velocity.y = jump_velocity

	# Horizontal Movement with simple acceleration / deceleration
	var input_dir: float = Input.get_axis("move_left", "move_right")
	if input_dir != 0.0:
		facing = 1 if input_dir > 0.0 else -1
		velocity.x = move_toward(velocity.x, input_dir * max_speed, acceleration * delta)
	else:
		velocity.x = move_toward(velocity.x, 0.0, deceleration * delta)

	move_and_slide()
	_update_animations(delta)
	_sync_aura_visual()

	# Attack: LIGHT_BEAM
	if Input.is_action_just_pressed("attack_light"):
		fire_light_beam()

func fire_light_beam() -> void:
	if attack_cooldown > 0.0 or light_system == null:
		return
	if not light_system.consume_energy(light_system.beam_cost):
		return
	attack_cooldown = 0.26
	attack_anim_timer = 0.24
	if light_beam_scene:
		var beam: Node2D = light_beam_scene.instantiate()
		beam.global_position = global_position + Vector2(facing * 24.0, -8.0)
		beam.call("setup", facing)
		get_tree().current_scene.add_child(beam)

func take_damage(amount: int, source_pos: Vector2) -> void:
	if invuln_timer > 0.0 or current_hp <= 0:
		return
	current_hp = maxi(0, current_hp - amount)
	invuln_timer = 1.05
	hurt_flash_timer = 0.26
	var push_dir: float = signf(global_position.x - source_pos.x)
	if push_dir == 0.0:
		push_dir = -facing
	velocity = Vector2(push_dir * 280.0, -260.0)
	health_changed.emit(current_hp, max_hp)
	if current_hp <= 0:
		player_died.emit()

func _update_animations(_delta: float) -> void:
	var desired: String = "idle"
	if current_hp <= 0:
		desired = "death"
	elif hurt_flash_timer > 0.04:
		desired = "damage"
	elif attack_anim_timer > 0.0:
		desired = "attack"
	elif not is_on_floor():
		desired = "jump" if velocity.y < 0.0 else "fall"
	elif Input.is_action_pressed("purify_channel") and absf(velocity.x) <= 24.0:
		desired = "purify"
	elif absf(velocity.x) > 18.0:
		desired = "run"

	current_anim_state = desired
	if anim_sprite:
		anim_sprite.scale.x = float(facing)
		if anim_sprite.has_node("AnimatedSprite2D"):
			var sprite_node: AnimatedSprite2D = anim_sprite.get_node("AnimatedSprite2D")
			if sprite_node.animation != desired:
				sprite_node.play(desired)

func _sync_aura_visual() -> void:
	if point_light and light_system:
		var ratio: float = light_system.get_energy_ratio()
		point_light.texture_scale = lerpf(0.9, 2.2, ratio)
		point_light.energy = lerpf(0.6, 1.45, ratio)
