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
def tree():
    trunk = mat("bark", "#3b2a22", 0.9)
    leaf = mat("leaf", "#2b6a58", 0.85)
    leaf2 = mat("leaf2", "#357a5f", 0.85)
    parts = [
        cyl(0.17, 2.6, (0, 0, 1.3), trunk, verts=7),
        ico(1.55, (0, 0, 3.4), leaf, squash=0.9),
        ico(1.05, (0.8, 0.2, 2.8), leaf2),
        ico(1.1, (-0.7, -0.4, 3.0), leaf2),
        ico(0.9, (0.1, 0.6, 4.2), leaf),
    ]
    return join(parts, "tree")


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


def car(name, color):
    body = mat("car_" + color, color, 0.35, metal=0.5)
    glass = mat("glass", "#0b1222", 0.15, metal=0.2)
    black = mat("rubber", "#0a0a0d", 0.9)
    head = mat("headlight", "#fff2cf", 0.3, "#fff2cf", 4.0)
    tail = mat("taillight", "#ff2a2a", 0.3, "#ff2a2a", 3.0)
    parts = [
        box((1.8, 4.3, 0.62), (0, 0, 0.62), body, bevel=0.14),
        box((1.62, 2.2, 0.55), (0, -0.25, 1.15), glass, bevel=0.12),
        box((1.5, 1.9, 0.08), (0, -0.25, 1.46), body, bevel=0.03),
    ]
    for x in (-0.95, 0.95):
        for y in (-1.35, 1.35):
            parts.append(cyl(0.34, 0.24, (x, y, 0.34), black, rot=(0, math.radians(90), 0), verts=10))
    for x in (-0.6, 0.6):
        parts.append(box((0.38, 0.06, 0.16), (x, 2.16, 0.7), head))
        parts.append(box((0.38, 0.06, 0.14), (x, -2.16, 0.74), tail))
    return join(parts, name)


def build_props():
    clear()
    items = [tree(), bench(), bin_(), car("car_a", "#8a2f3a"), car("car_b", "#2f5a8a"), car("car_c", "#b8b3a2")]
    for i, o in enumerate(items):
        o.location = (i * 6, 0, 0)
    export(os.path.join(OUT, "props.glb"), items)


# ─── Комната (координаты как в three.js, x/z → x/-y) ───────────────────────
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
    # растение в углу справа
    P.append(cyl(0.25, 0.42, (3.3, 3.3, 0.21), pot, verts=10))
    for i, (dx, dy, dz, r) in enumerate([(0, 0, 0.85, 0.42), (0.18, 0.1, 1.2, 0.3), (-0.15, -0.1, 1.05, 0.32)]):
        P.append(ico(r, (3.3 + dx, 3.3 + dy, dz), leaves))
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
    # горшок на подоконнике
    P.append(cyl(0.1, 0.16, (-1.2, 3.9, 1.0), pot, verts=8))
    P.append(ico(0.16, (-1.2, 3.9, 1.22), leaves, sub=1))

    room = join(P, "room_props")
    export(os.path.join(OUT, "room.glb"), [room])


build_props()
build_room()
