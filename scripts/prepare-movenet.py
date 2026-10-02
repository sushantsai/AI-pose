"""Rebuild assets/models/movenet_multipose_256.tflite from Google's release.

MoveNet MultiPose Lightning ships with a dynamic input shape ([1, -1, -1, 3]),
but react-native-fast-tflite cannot resize input tensors at runtime. This
script patches the stored input shape to a fixed [1, 256, 256, 3] so the
model can be allocated as-is on device.

Usage:
    pip install tflite ai-edge-litert numpy
    python scripts/prepare-movenet.py
"""

import io
import struct
import tarfile
import urllib.request
from pathlib import Path

import tflite

URL = (
    "https://www.kaggle.com/api/v1/models/google/movenet/tfLite/"
    "multipose-lightning-tflite-float16/1/download"
)
OUT = Path(__file__).resolve().parent.parent / "assets/models/movenet_multipose_256.tflite"
SIZE = 256


def main() -> None:
    archive = urllib.request.urlopen(URL).read()
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        member = next(m for m in tar.getmembers() if m.name.endswith(".tflite"))
        buf = bytearray(tar.extractfile(member).read())

    model = tflite.Model.GetRootAsModel(buf, 0)
    graph = model.Subgraphs(0)
    tensor = graph.Tensors(graph.Inputs(0))
    shape_field = tensor._tab.Offset(4)  # Tensor.shape
    start = tensor._tab.Vector(shape_field)
    assert struct.unpack_from("<4i", buf, start) == (1, 1, 1, 3), "unexpected model layout"
    struct.pack_into("<4i", buf, start, 1, SIZE, SIZE, 3)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(buf)

    try:
        from ai_edge_litert.interpreter import Interpreter

        interpreter = Interpreter(model_path=str(OUT))
        interpreter.allocate_tensors()
        print("input", interpreter.get_input_details()[0]["shape"])
        print("output", interpreter.get_output_details()[0]["shape"])
    except ImportError:
        pass
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
