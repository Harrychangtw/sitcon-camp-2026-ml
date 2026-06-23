"""camp_precompute — precompute pipeline for SITCON Camp 2026 ML stations.

Heavy compute (training, exporting models) happens here, ahead of time. The
output is small artifacts (ONNX models, JSON) that the browser apps load and
play back or run light inference on. The browser never trains.
"""

__version__ = "0.0.0"
__all__ = ["__version__"]
