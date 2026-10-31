extends CharacterBody2D
class_name ShadowCreature

@export var patrol_min_x: float = 1100.0
@export var patrol_max_x: float = 1460.0
@export var detect_radius: float = 270.0
@export var strike_range: float = 72.0
@export var move_speed: float = 135.0
@export var max_hp: int = 3
@export var contact_damage: int = 1
@export var gravity_scale: float = 1150.0

var current_hp: int = 3
var facing: int = -1
var ai_state: String = "patrol"
var anim_state: String = "idle"
var idle_timer: float = 0.0
var telegraph_timer: float = 0.0
var attack_active_timer: float = 0.0
var cooldown_timer: float = 0.0
var hit_flash_timer: float = 0.0
var ko_timer: float = 0.0
var target_player: Node2D = null

@onready var sprite: AnimatedSprite2D = get_node_or_null("AnimatedSprite2D")

func _ready() -> void:
	current_hp = max_hp

func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity.y = minf(540.0, velocity.y + gravity_scale * delta)
	else:
		velocity.y = 0.0

	if hit_flash_timer > 0.0:
		hit_flash_timer = maxf(0.0, hit_flash_timer - delta)
	if cooldown_timer > 0.0:
		cooldown_timer = maxf(0.0, cooldown_timer - delta)

	if ai_state == "ko":
		ko_timer -= delta
		velocity.x *= exp(-8.0 * delta)
		move_and_slide()
		_update_animation()
		if ko_timer <= 0.0:
			queue_free()
		return

	if hit_flash_timer > 0.04:
		velocity.x *= exp(-7.0 * delta)
	elif ai_state == "windup":
		velocity.x *= exp(-14.0 * delta)
		telegraph_timer -= delta
		if telegraph_timer <= 0.0:
			ai_state = "attack"
			attack_active_timer = 0.28
			velocity.x = float(facing) * move_speed * 1.65
	elif ai_state == "attack":
		attack_active_timer -= delta
		if attack_active_timer < 0.12:
			velocity.x *= exp(-9.0 * delta)
		if attack_active_timer <= 0.0:
			ai_state = "chase"
			cooldown_timer = 0.75
	elif target_player and is_instance_valid(target_player):
		var dx: float = target_player.global_position.x - global_position.x
		var dist: float = global_position.distance_to(target_player.global_position)
		if dist <= detect_radius:
			var desired_facing: int = 1 if dx >= 0.0 else -1
			if dist <= strike_range and cooldown_timer <= 0.0:
				facing = desired_facing
				ai_state = "windup"
				telegraph_timer = 0.30
			else:
				ai_state = "chase"
				if desired_facing != facing and absf(velocity.x) > 22.0:
					velocity.x *= exp(-14.0 * delta)
					if absf(velocity.x) <= 28.0:
						facing = desired_facing
				else:
					facing = desired_facing
					var target_vx: float = float(facing) * move_speed
					velocity.x = lerpf(velocity.x, target_vx, minf(1.0, 10.5 * delta))
		else:
			_patrol_step(delta)
	else:
		_patrol_step(delta)

	global_position.x = clampf(global_position.x, patrol_min_x, patrol_max_x)
	move_and_slide()
	_update_animation()

func _patrol_step(delta: float) -> void:
	if idle_timer > 0.0:
		ai_state = "idle"
		idle_timer = maxf(0.0, idle_timer - delta)
		velocity.x *= exp(-14.0 * delta)
		if absf(velocity.x) < 5.0:
			velocity.x = 0.0
		if idle_timer <= 0.0:
			ai_state = "patrol"
		return

	ai_state = "patrol"
	var patrol_target: float = move_speed * 0.52
	velocity.x = lerpf(velocity.x, float(facing) * patrol_target, minf(1.0, 8.0 * delta))

	if global_position.x <= patrol_min_x + 2.0 and facing == -1:
		global_position.x = patrol_min_x
		velocity.x = 0.0
		facing = 1
		ai_state = "idle"
		idle_timer = 0.28
	elif global_position.x >= patrol_max_x - 2.0 and facing == 1:
		global_position.x = patrol_max_x
		velocity.x = 0.0
		facing = -1
		ai_state = "idle"
		idle_timer = 0.28

func _update_animation() -> void:
	var abs_vx: float = absf(velocity.x)
	if ai_state == "ko" or current_hp <= 0:
		anim_state = "death"
	elif hit_flash_timer > 0.02:
		anim_state = "hit"
	elif ai_state == "windup" or ai_state == "attack":
		anim_state = "attack"
	elif ai_state == "chase" and abs_vx >= move_speed * 0.64:
		anim_state = "run"
	elif abs_vx >= 10.0:
		anim_state = "walk"
	else:
		anim_state = "idle"

	if sprite:
		sprite.flip_h = facing < 0
		if sprite.animation != anim_state and sprite.sprite_frames and sprite.sprite_frames.has_animation(anim_state):
			sprite.play(anim_state)
		if anim_state == "walk":
			sprite.speed_scale = clampf(abs_vx / maxf(30.0, move_speed * 0.52), 0.45, 1.4)
		elif anim_state == "run":
			sprite.speed_scale = clampf(abs_vx / maxf(50.0, move_speed), 0.6, 1.45)
		else:
			sprite.speed_scale = 1.0

func take_light_damage(amount: int) -> void:
	current_hp = maxi(0, current_hp - amount)
	hit_flash_timer = 0.18
	if current_hp <= 0:
		ai_state = "ko"
		ko_timer = 0.48
	elif ai_state == "patrol" or ai_state == "idle":
		ai_state = "chase"

func _on_hitbox_body_entered(body: Node) -> void:
	if body.has_method("take_damage"):
		body.call("take_damage", contact_damage, global_position)
