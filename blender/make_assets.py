"""
Генерация моделей для 3D-прогулки. Запуск:
  blender -b -P blender/make_assets.py
Результат: public/models/props.glb (улица) и public/models/room.glb (комната).
Единицы — метры. Blender +Y (вперёд) = three.js -Z.
"""
import bpy, os, math

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "models")
os.makedirs(OUT, exist_ok=True)


def hex_rgba(h):
    h = h.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    # sRGB -> linear
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (f(r), f(g), f(b), 1.0)


_mats = {}


def mat(name, color, rough=0.75, emit=None, strength=0.0, metal=0.0):
    key = (name, color, emit, strength)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = hex_rgba(color)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit:
        bsdf.inputs["Emission Color"].default_value = hex_rgba(emit)
        bsdf.inputs["Emission Strength"].default_value = strength
    _mats[key] = m
    return m


def finish(o, m):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    o.data.materials.clear()
    o.data.materials.append(m)
    return o


def box(size, loc, m, rot=(0, 0, 0), bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    finish(o, m)
    if bevel:
        mod = o.modifiers.new("b", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier="b")
    return o


def cyl(r, depth, loc, m, rot=(0, 0, 0), verts=12):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=verts, location=loc, rotation=rot)
    return finish(bpy.context.active_object, m)


def ico(r, loc, m, sub=2, squash=1.0):
    bpy.ops.mesh.primitive_ico_sphere_add(radius=r, subdivisions=sub, location=loc)
    o = bpy.context.active_object
    o.scale = (1, 1, squash)
    return finish(o, m)


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    return o


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def export(path, objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
    )
    print("exported", path, os.path.getsize(path) // 1024, "KB")


# ─── Улица ──────────────────────────────────────────────────────────────────
def lumpy(r, loc, m, sub=2, amp=0.22, squash=1.0, seed=0):
    """Икосфера со случайным смещением вершин — «комок» листвы."""
    import random
    rnd = random.Random(seed)
    bpy.ops.mesh.primitive_ico_sphere_add(radius=r, subdivisions=sub, location=loc)
    o = bpy.context.active_object
    for v in o.data.vertices:
        k = 1 + (rnd.random() * 2 - 1) * amp
        v.co.x *= k
        v.co.y *= k
        v.co.z *= k * squash
        if v.co.z < -r * 0.45 * squash:  # плоское дно кроны
            v.co.z = -r * 0.45 * squash
    return finish(o, m)


def branch(p0, p1, r0, r1, m):
    import mathutils
    a, b = mathutils.Vector(p0), mathutils.Vector(p1)
    d = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=r0, radius2=r1, depth=d.length, location=(a + b) / 2)
    o = bpy.context.active_object
    o.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    return finish(o, m)


def tree():
    """Лиственное дерево: конусный ствол с расширением у земли, ветви, крона из комков."""
    bark = mat("bark", "#3b2a22", 0.95)
    dark = mat("leaf_dark", "#1f4d42", 0.9)
    mid = mat("leaf", "#2c6b55", 0.9)
    light = mat("leaf_light", "#3b8566", 0.9)
    parts = [
        branch((0, 0, 0), (0, 0, 2.5), 0.3, 0.13, bark),
        branch((0, 0, 2.2), (0.9, 0.3, 3.4), 0.11, 0.05, bark),
        branch((0, 0, 2.4), (-0.8, -0.5, 3.5), 0.1, 0.05, bark),
        branch((0, 0, 2.6), (0.1, 0.9, 3.6), 0.09, 0.04, bark),
    ]
    clumps = [
        ((0, 0, 3.7), 1.25, mid), ((0.95, 0.35, 3.4), 0.95, mid), ((-0.9, -0.5, 3.5), 1.0, dark),
        ((0.1, 0.95, 3.6), 0.9, dark), ((-0.5, 0.7, 4.2), 0.9, light), ((0.6, -0.6, 4.3), 0.95, light),
        ((0, 0.1, 4.6), 0.85, light), ((1.1, -0.3, 4.0), 0.7, mid), ((-1.1, 0.2, 4.0), 0.75, dark),
    ]
    for n, (loc, r, m) in enumerate(clumps):
        parts.append(lumpy(r, loc, m, amp=0.2, squash=0.85, seed=n + 3))
    return join(parts, "tree")


def tree_b():
    """Высокое узкое дерево (тополь): вертикальная крона из наложенных комков."""
    bark = mat("bark", "#3b2a22", 0.95)
    dark = mat("leaf_dark", "#1f4d42", 0.9)
    mid = mat("leaf", "#2c6b55", 0.9)
    light = mat("leaf_light", "#3b8566", 0.9)
    parts = [branch((0, 0, 0), (0, 0, 3.6), 0.24, 0.1, bark)]
    zs = [3.0, 3.8, 4.6, 5.4, 6.2, 6.9]
    for n, z in enumerate(zs):
        r = [0.95, 1.1, 1.05, 0.95, 0.75, 0.5][n]
        m = [dark, mid, mid, light, light, light][n]
        parts.append(lumpy(r, (0.12 * ((n % 2) * 2 - 1), 0.1 * (1 - (n % 3)), z), m, amp=0.18, squash=1.25, seed=n + 20))
    parts.append(lumpy(0.7, (0.55, 0.2, 3.7), dark, amp=0.2, squash=1.0, seed=40))
    parts.append(lumpy(0.65, (-0.5, -0.3, 4.3), mid, amp=0.2, squash=1.0, seed=41))
    return join(parts, "tree_b")


def bench():
    wood = mat("wood", "#6b4a35", 0.8)
    iron = mat("iron", "#1b1e2a", 0.5, metal=0.6)
    parts = [
        box((1.7, 0.45, 0.06), (0, 0, 0.45), wood),
        box((1.7, 0.06, 0.42), (0, -0.22, 0.75), wood, rot=(math.radians(-8), 0, 0)),
        box((0.06, 0.5, 0.45), (-0.75, 0, 0.22), iron),
        box((0.06, 0.5, 0.45), (0.75, 0, 0.22), iron),
        box((0.06, 0.06, 0.45), (-0.75, -0.24, 0.65), iron),
        box((0.06, 0.06, 0.45), (0.75, -0.24, 0.65), iron),
    ]
    return join(parts, "bench")


def bin_():
    green = mat("bin", "#27402f", 0.6, metal=0.3)
    dark = mat("bin_dark", "#151a18", 0.6)
    parts = [cyl(0.26, 0.85, (0, 0, 0.45), green, verts=10), cyl(0.29, 0.07, (0, 0, 0.9), dark, verts=10)]
    return join(parts, "bin")


def extrude_poly(pts, width, m, name="p", bevel=0.0):
    """Профиль в плоскости (y, z), выдавленный по x на ширину width."""
    import bmesh
    me = bpy.data.meshes.new(name)
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    bm = bmesh.new()
    hw = width / 2
    left = [bm.verts.new((-hw, y, z)) for y, z in pts]
    right = [bm.verts.new((hw, y, z)) for y, z in pts]
    bm.faces.new(left[::-1])
    bm.faces.new(right)
    n = len(pts)
    for k in range(n):
        a, b = k, (k + 1) % n
        bm.faces.new((left[a], left[b], right[b], right[a]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    finish(o, m)
    if bevel:
        mod = o.modifiers.new("b", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier="b")
    return o


CAR_STYLES = {
    # lower — силуэт кузова до линии окон (y вперёд, z вверх), glass — стёкла,
    # w — ширина кузова, r — радиус колеса, clear — клиренс, wing — задний спойлер
    # fastback — как Audi A7: длинный капот, плавная крыша до самого багажника
    "fastback": dict(
        lower=[(2.3, 0.36), (2.3, 0.7), (2.05, 0.84), (1.0, 0.9), (-1.0, 0.93), (-2.0, 0.92), (-2.3, 0.84), (-2.3, 0.36)],
        glass=[(1.0, 0.9), (0.25, 1.36), (-0.9, 1.42), (-1.8, 1.0), (-1.95, 0.92)],
        w=1.9, r=0.35, clear=0.0, wing=False),
    # super — как Ferrari F40: низкий клин, высокий задний спойлер
    "super": dict(
        lower=[(2.15, 0.26), (2.15, 0.48), (1.2, 0.66), (0.75, 0.76), (-0.3, 0.88), (-1.6, 0.96), (-2.1, 0.9), (-2.15, 0.28)],
        glass=[(0.75, 0.76), (0.15, 1.12), (-0.55, 1.15), (-1.25, 0.96)],
        w=1.96, r=0.34, clear=-0.04, wing=True),
    "suv": dict(
        lower=[(2.25, 0.44), (2.25, 0.94), (2.0, 1.06), (0.95, 1.12), (-2.1, 1.12), (-2.28, 1.0), (-2.28, 0.44)],
        glass=[(0.95, 1.12), (0.5, 1.74), (-1.95, 1.74), (-2.15, 1.12)],
        w=1.95, r=0.39, clear=0.1, wing=False),
}


def smooth(o):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(38))
    except Exception:
        bpy.ops.object.shade_smooth()


def wheel(x, y, r, tire, rim, disc):
    out = []
    side = 1 if x > 0 else -1
    out.append(cyl(r, 0.26, (x, y, r), tire, rot=(0, math.radians(90), 0), verts=20))
    out.append(cyl(r * 0.66, 0.27, (x + side * 0.012, y, r), rim, rot=(0, math.radians(90), 0), verts=20))
    out.append(cyl(r * 0.5, 0.28, (x + side * 0.012, y, r), disc, rot=(0, math.radians(90), 0), verts=16))
    for k in range(5):
        out.append(box((0.03, r * 1.25, 0.06), (x + side * 0.03, y, r), rim, rot=(math.radians(k * 36), 0, 0)))
    out.append(cyl(r * 0.14, 0.3, (x + side * 0.03, y, r), disc, rot=(0, math.radians(90), 0), verts=8))
    return out


def car(name, color, style="fastback"):
    st = CAR_STYLES[style]
    w = st["w"]
    body = mat("car_" + color, color, 0.4, metal=0.1)
    glass = mat("glass", "#0a1020", 0.08, metal=0.3)
    black = mat("rubber", "#0a0a0d", 0.9)
    trim = mat("trim", "#15161c", 0.5)
    rim = mat("rim", "#b9bfce", 0.35, metal=0.3)
    disc = mat("disc", "#202228", 0.5, metal=0.6)
    head = mat("headlight", "#fff2cf", 0.3, "#fff2cf", 4.0)
    tail = mat("taillight", "#ff2a2a", 0.3, "#ff2a2a", 3.0)
    plate = mat("plate", "#e8e6dc", 0.6)
    chrome = mat("chrome", "#d8dce6", 0.3, metal=0.3)
    lo = st["lower"]
    front = max(p[0] for p in lo)
    rear = min(p[0] for p in lo)
    gl = st["glass"]
    top = max(p[1] for p in gl)
    r = st["r"]
    c = st["clear"]
    parts = [
        extrude_poly(lo, w, body, "body", bevel=0.1),
        extrude_poly(gl, w - 0.26, glass, "glass", bevel=0.05),
        # крыша: тонкая крышка того же цвета
        extrude_poly([(gl[1][0] + 0.02, top + 0.03), (gl[2][0] - 0.02, top + 0.03), (gl[2][0] - 0.06, top - 0.04), (gl[1][0] + 0.06, top - 0.04)], w - 0.3, body, "roof", bevel=0.03),
    ]
    # пороги и низ
    parts.append(box((w - 0.02, front - rear - 0.5, 0.1), (0, (front + rear) / 2, 0.3 + c), trim, bevel=0.02))
    # колёса, диски со спицами, арки
    wy_f, wy_r = front - 0.82, rear + 0.82
    for x in (-w / 2 + 0.03, w / 2 - 0.03):
        for y in (wy_f, wy_r):
            parts += wheel(x, y, r, black, rim, disc)
            parts.append(box((0.05, r * 2.35, r * 0.95), (x * 1.0, y, r + r * 1.0), trim))
    # передок: бампер, решётка, воздухозаборники, фары
    parts.append(box((w, 0.16, 0.24), (0, front - 0.04, 0.46 + c), trim, bevel=0.04))
    parts.append(box((w * 0.55, 0.05, 0.17), (0, front + 0.0, 0.66 + c), trim, bevel=0.01))
    parts.append(box((w * 0.5, 0.02, 0.012), (0, front + 0.02, 0.7 + c), chrome))
    for x in (-0.66, 0.66):
        parts.append(box((0.42, 0.06, 0.1), (x, front - 0.01, 0.74 + c), head, bevel=0.02))
        parts.append(box((0.3, 0.05, 0.09), (x * 1.25, front - 0.04, 0.5 + c), trim))
    parts.append(box((0.5, 0.02, 0.12), (0, front + 0.05, 0.42 + c), plate))
    # корма
    parts.append(box((w, 0.16, 0.26), (0, rear + 0.04, 0.46 + c), trim, bevel=0.04))
    parts.append(box((w * 0.82, 0.05, 0.09), (0, rear + 0.0, 0.8 + c), tail, bevel=0.02))
    parts.append(box((0.5, 0.02, 0.12), (0, rear - 0.05, 0.52 + c), plate))
    # выхлопные трубы
    for x in (-0.5, 0.5):
        parts.append(cyl(0.045, 0.1, (x, rear - 0.04, 0.36 + c), chrome, rot=(math.radians(90), 0, 0), verts=8))
    # зеркала
    for x in (-w / 2 - 0.04, w / 2 + 0.04):
        parts.append(box((0.14, 0.22, 0.11), (x, gl[0][0] - 0.2, gl[0][1] + 0.1), body, bevel=0.03))
    # антенна «плавник» на крыше
    if style != "super":
        parts.append(box((0.04, 0.2, 0.07), (0, gl[2][0] + 0.25, top + 0.06), black))
    if st["wing"]:
        # спойлер как у F40: две стойки и широкая плоскость
        for x in (-0.7, 0.7):
            parts.append(box((0.05, 0.12, 0.46), (x, rear + 0.2, 1.12), body))
        parts.append(box((1.84, 0.5, 0.05), (0, rear + 0.05, 1.36), body, bevel=0.01))
        parts.append(box((0.04, 0.5, 0.18), (-0.92, rear + 0.05, 1.3), body))
        parts.append(box((0.04, 0.5, 0.18), (0.92, rear + 0.05, 1.3), body))
    o = join(parts, name)
    smooth(o)
    return o


def build_props():
    clear()
    items = [tree(), tree_b(), bench(), bin_(), car("car_a", "#5b6372", "fastback"), car("car_b", "#b3202a", "super"), car("car_c", "#26344f", "suv")]
    for i, o in enumerate(items):
        o.location = (i * 6, 0, 0)
    export(os.path.join(OUT, "props.glb"), items)


# ─── Комната (координаты как в three.js, x/z → x/-y) ───────────────────────
def leaf(loc, length, width, yaw, pitch, m):
    """Лист-«лодочка»: сплюснутая сфера, основание в loc, наклон pitch от вертикали, поворот yaw."""
    bpy.ops.mesh.primitive_ico_sphere_add(radius=1, subdivisions=1, location=(0, 0, 0))
    o = bpy.context.active_object
    o.scale = (width, 0.03, length)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for v in o.data.vertices:
        v.co.z += length
    o.rotation_euler = (pitch, 0, yaw)
    o.location = loc
    return finish(o, m)


def flower(loc, stem_h, petal_m, center_m, stem_m, leaf_m, tilt=(0.0, 0.0)):
    """Цветок: стебель, пара листьев, венчик из 8 лепестков и серединка."""
    x, y, z = loc
    tx, ty = tilt
    top = (x + tx, y + ty, z + stem_h)
    out = [branch((x, y, z), top, 0.014, 0.01, stem_m)]
    out.append(leaf((x + tx * 0.4, y + ty * 0.4, z + stem_h * 0.35), 0.12, 0.035, 0.3, 1.0, leaf_m))
    out.append(leaf((x + tx * 0.5, y + ty * 0.5, z + stem_h * 0.5), 0.1, 0.03, 3.4, 1.0, leaf_m))
    for k in range(8):
        a = k * math.pi / 4
        out.append(leaf(top, 0.07, 0.03, a, 1.25, petal_m))
    out.append(ico(0.028, (top[0], top[1], top[2] + 0.012), center_m, sub=1))
    return out


def leafy_plant(base, pot_top, stem_m, leaf_ms, count=11, height=0.9, seed=1):
    """Комнатное растение: центральный ствол и листья по спирали, крупные снизу."""
    import random
    rnd = random.Random(seed)
    x, y, z = base
    out = [branch((x, y, z), (x, y, z + height), 0.035, 0.015, stem_m)]
    for k in range(count):
        t = k / (count - 1)
        yaw = k * 2.4 + rnd.random() * 0.4
        ln = 0.42 - 0.18 * t + rnd.random() * 0.06
        wd = ln * 0.55
        pz = z + 0.15 + height * (0.15 + 0.85 * t) * 0.9
        out.append(leaf((x, y, pz), ln, wd, yaw, 0.55 + 0.5 * (1 - t) + rnd.random() * 0.2, leaf_ms[k % len(leaf_ms)]))
    return out


def build_room():
    clear()
    wood = mat("desk_wood", "#7a5238", 0.7)
    dark_wood = mat("shelf_wood", "#4c3526", 0.75)
    fabric = mat("chair_fabric", "#34426f", 0.9)
    metal = mat("laptop_body", "#a0a8bd", 0.4, metal=0.7)
    screen = mat("screen", "#4d9dff", 0.3, "#4d9dff", 2.2)
    black = mat("black", "#101219", 0.6)
    lamp_shade = mat("lamp_shade", "#ffcf8a", 0.5, "#ffb866", 5.0)
    rug = mat("rug", "#7a3b4e", 0.95)
    curtain = mat("curtain", "#8a3d52", 0.95)
    pot = mat("pot", "#c46a4a", 0.8)
    leaves = mat("plant_leaves", "#3d8f5a", 0.8)
    frame = mat("frame", "#caa86a", 0.4, metal=0.5)
    art = mat("art", "#2a4a7a", 0.8, "#2a4a7a", 0.4)
    book_cols = ["#b5483a", "#3a6bb5", "#d6a93a", "#4a9a6a", "#8a5ab5", "#c9c4b4"]
    paper = mat("paper", "#e8e2d0", 0.9)
    mug = mat("mug", "#e9e4d6", 0.5)

    P = []
    # стол: верх + ножки (центр three (0,0.75,-1.5) → blender (0,1.5,0.75))
    P.append(box((2.0, 1.0, 0.07), (0, 1.5, 0.75), wood, bevel=0.01))
    for x in (-0.92, 0.92):
        for y in (1.1, 1.9):
            P.append(box((0.06, 0.06, 0.74), (x, y, 0.37), dark_wood))
    P.append(box((1.84, 0.04, 0.3), (0, 1.9, 0.52), dark_wood))  # царга
    # ноутбук: основание и экран, повёрнутый к камере (-Y в blender)
    P.append(box((0.8, 0.55, 0.025), (0, 1.45, 0.8), metal, bevel=0.008))
    P.append(box((0.74, 0.012, 0.46), (0, 1.62, 1.04), screen, rot=(math.radians(-12), 0, 0)))
    P.append(box((0.8, 0.02, 0.5), (0, 1.635, 1.04), metal, rot=(math.radians(-12), 0, 0)))
    # лампа на столе справа
    P.append(cyl(0.11, 0.03, (0.78, 1.8, 0.8), black))
    P.append(cyl(0.015, 0.5, (0.78, 1.8, 1.05), black, verts=6))
    P.append(cyl(0.12, 0.14, (0.78, 1.72, 1.34), lamp_shade, rot=(math.radians(25), 0, 0), verts=10))
    # кружка и бумаги
    P.append(cyl(0.05, 0.1, (-0.7, 1.35, 0.84), mug, verts=10))
    P.append(box((0.3, 0.4, 0.01), (-0.55, 1.65, 0.79), paper, rot=(0, 0, math.radians(14))))
    # стул
    P.append(box((0.52, 0.5, 0.07), (0, 0.55, 0.47), fabric, bevel=0.02))
    P.append(box((0.52, 0.07, 0.5), (0, 0.32, 0.78), fabric, bevel=0.02))
    P.append(cyl(0.035, 0.45, (0, 0.55, 0.22), black, verts=6))
    P.append(cyl(0.25, 0.04, (0, 0.55, 0.03), black, verts=5))
    # ковёр
    P.append(box((3.4, 2.6, 0.012), (0, 0.9, 0.007), rug, bevel=0.003))
    # книжный шкаф у левой стены (x=-3.8)
    P.append(box((0.35, 2.4, 2.2), (-3.8, 0.2, 1.1), dark_wood))
    for z in (0.5, 1.1, 1.7):
        P.append(box((0.4, 2.35, 0.04), (-3.77, 0.2, z), wood))
    import random
    random.seed(4)
    for z0 in (0.54, 1.14, 1.74):
        y = -0.9
        while y < 1.2:
            w = 0.05 + random.random() * 0.05
            h = 0.28 + random.random() * 0.12
            P.append(box((0.24, w, h), (-3.75, y, z0 + h / 2), mat("book", random.choice(book_cols), 0.8)))
            y += w + 0.012
    # второй шкаф — у задней стены слева от окна (виден сразу при входе)
    P.append(box((1.5, 0.35, 2.3), (-3.1, 3.82, 1.15), dark_wood))
    for z in (0.5, 1.1, 1.7):
        P.append(box((1.45, 0.38, 0.04), (-3.1, 3.8, z), wood))
    for z0 in (0.54, 1.14, 1.74):
        x = -3.78
        while x < -2.45:
            w = 0.05 + random.random() * 0.05
            h = 0.27 + random.random() * 0.13
            P.append(box((w, 0.24, h), (x, 3.7, z0 + h / 2), mat("book", random.choice(book_cols), 0.8)))
            x += w + 0.012
    # люстра: цепь, розетка, кольцо, шесть рожков с лампами, подвеска
    gold = mat("gold", "#b8923a", 0.35, metal=0.9)
    bulb = mat("bulb", "#ffe3a8", 0.4, "#ffcf7a", 7.0)
    cx, cy = 0.0, 1.5  # blender (x, y) = three (x, -z)
    P.append(cyl(0.14, 0.04, (cx, cy, 3.98), gold, verts=16))
    P.append(cyl(0.012, 0.6, (cx, cy, 3.66), gold, verts=6))
    bpy.ops.mesh.primitive_torus_add(major_radius=0.36, minor_radius=0.025, major_segments=24, minor_segments=8, location=(cx, cy, 3.36))
    P.append(finish(bpy.context.active_object, gold))
    for k in range(6):
        ang = k * math.pi / 3
        ax, ay = cx + math.cos(ang) * 0.36, cy + math.sin(ang) * 0.36
        P.append(cyl(0.012, 0.22, (ax, ay, 3.46), gold, verts=6))
        P.append(cyl(0.035, 0.05, (ax, ay, 3.57), gold, verts=8))
        P.append(ico(0.045, (ax, ay, 3.64), bulb, sub=1, squash=1.5))
        # хрустальная подвеска
        P.append(ico(0.025, (cx + math.cos(ang + 0.5) * 0.3, cy + math.sin(ang + 0.5) * 0.3, 3.28), mat("crystal", "#cfe6ff", 0.1, "#9cc8ff", 0.8), sub=1))
    P.append(cyl(0.012, 0.18, (cx, cy, 3.25), gold, verts=6))
    P.append(ico(0.07, (cx, cy, 3.12), bulb, sub=1))
    # растение в углу справа: кадка и пышная крона из листьев
    leaves2 = mat("plant_leaves2", "#2f7a4c", 0.7)
    leaves3 = mat("plant_leaves3", "#4a9a5c", 0.7)
    stemg = mat("stem", "#3a5a34", 0.8)
    P.append(cyl(0.27, 0.45, (3.3, 3.3, 0.225), pot, verts=14))
    P.append(cyl(0.285, 0.05, (3.3, 3.3, 0.45), mat("pot_rim", "#a95537", 0.8), verts=14))
    P.append(cyl(0.25, 0.03, (3.3, 3.3, 0.47), mat("soil", "#2a1f18", 1.0), verts=14))
    P += leafy_plant((3.3, 3.3, 0.47), 0.47, stemg, [leaves, leaves2, leaves3], count=14, height=1.1, seed=3)
    P += leafy_plant((3.22, 3.36, 0.47), 0.47, stemg, [leaves2, leaves3], count=8, height=0.7, seed=9)
    # рамка с картиной на правой стене (x=4)
    P.append(box((0.04, 1.3, 0.9), (3.97, 0.4, 2.0), frame))
    P.append(box((0.045, 1.15, 0.75), (3.96, 0.4, 2.0), art))
    # подоконник и рама окна (проём x±1.6, y 0.9..3.4, стена z=-4 → y=+4)
    P.append(box((3.7, 0.32, 0.07), (0, 3.9, 0.88), wood))
    P.append(box((3.5, 0.1, 0.1), (0, 3.97, 3.45), dark_wood))
    P.append(box((0.1, 0.1, 2.6), (-1.65, 3.97, 2.15), dark_wood))
    P.append(box((0.1, 0.1, 2.6), (1.65, 3.97, 2.15), dark_wood))
    # шторы и карниз
    P.append(cyl(0.02, 3.9, (0, 3.85, 3.55), black, rot=(0, math.radians(90), 0), verts=6))
    for sx in (-1, 1):
        for k in range(4):
            P.append(box((0.22, 0.05, 2.7), (sx * (1.95 + k * 0.2 - 0.3), 3.82 - (k % 2) * 0.04, 2.15), curtain))
    # горшок с цветами на подоконнике
    petal = mat("petal", "#f4b6cf", 0.6)
    petal2 = mat("petal2", "#fff3d6", 0.6)
    ycen = mat("flower_center", "#e8b43a", 0.6)
    P.append(cyl(0.11, 0.17, (-1.2, 3.9, 1.0), pot, verts=12))
    P.append(cyl(0.12, 0.03, (-1.2, 3.9, 1.09), mat("pot_rim", "#a95537", 0.8), verts=12))
    P += flower((-1.2, 3.9, 1.1), 0.34, petal, ycen, stemg, leaves, tilt=(-0.03, 0.04))
    P += flower((-1.17, 3.93, 1.1), 0.44, petal2, ycen, stemg, leaves2, tilt=(0.05, -0.02))
    P += flower((-1.23, 3.87, 1.1), 0.28, petal, ycen, stemg, leaves, tilt=(-0.06, -0.03))
    P += flower((-1.2, 3.9, 1.1), 0.5, petal2, ycen, stemg, leaves3, tilt=(0.0, 0.07))

    room = join(P, "room_props")
    export(os.path.join(OUT, "room.glb"), [room])


build_props()
build_room()
