from __future__ import annotations

from alphabrain_ui.gpu import GPUMonitor


def test_nvml_device_count_failure_degrades_without_raising() -> None:
    class BrokenNVML:
        @staticmethod
        def nvmlDeviceGetCount():
            raise RuntimeError("driver reset")

    monitor = GPUMonitor.__new__(GPUMonitor)
    monitor._nvml = BrokenNVML()
    monitor._init_error = ""

    assert monitor.snapshot() == []
    assert monitor.available is False
    assert "driver reset" in monitor.error

    class RecoveredNVML:
        @staticmethod
        def nvmlDeviceGetCount():
            return 0

    monitor._nvml = RecoveredNVML()
    assert monitor.snapshot() == []
    assert monitor.available is True
    assert monitor.error == ""
