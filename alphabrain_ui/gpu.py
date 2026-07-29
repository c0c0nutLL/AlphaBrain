from __future__ import annotations

import shutil
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import psutil


@dataclass
class GPUProcess:
    pid: int
    used_memory_bytes: int | None
    name: str = ""
    username: str = ""


@dataclass
class GPUInfo:
    index: int
    uuid: str
    name: str
    memory_total_bytes: int
    memory_used_bytes: int
    memory_free_bytes: int
    utilization_percent: int
    temperature_c: int | None
    processes: list[GPUProcess]
    reserved_by_job_id: str | None = None
    available: bool = False
    error: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class GPUMonitor:
    """Small NVML wrapper that degrades cleanly on CPU-only developer hosts."""

    def __init__(self) -> None:
        self._nvml = None
        self._init_error = ""
        try:
            import pynvml

            pynvml.nvmlInit()
            self._nvml = pynvml
        except Exception as exc:  # NVML may be unavailable in CI
            self._init_error = str(exc)

    @property
    def available(self) -> bool:
        return self._nvml is not None and not self._init_error

    @property
    def error(self) -> str:
        return self._init_error

    def snapshot(self, reservations: dict[int, str] | None = None) -> list[GPUInfo]:
        reservations = reservations or {}
        if self._nvml is None:
            return []
        nvml = self._nvml
        try:
            device_count = nvml.nvmlDeviceGetCount()
        except Exception as exc:
            self._init_error = str(exc)
            return []
        self._init_error = ""
        result: list[GPUInfo] = []
        for index in range(device_count):
            try:
                handle = nvml.nvmlDeviceGetHandleByIndex(index)
                memory = nvml.nvmlDeviceGetMemoryInfo(handle)
                utilization = nvml.nvmlDeviceGetUtilizationRates(handle)
                processes: dict[int, GPUProcess] = {}
                for getter_name in (
                    "nvmlDeviceGetComputeRunningProcesses",
                    "nvmlDeviceGetGraphicsRunningProcesses",
                ):
                    getter = getattr(nvml, getter_name, None)
                    if getter is None:
                        continue
                    try:
                        rows = getter(handle)
                    except Exception:
                        rows = []
                    for row in rows:
                        pid = int(row.pid)
                        used = getattr(row, "usedGpuMemory", None)
                        try:
                            proc = psutil.Process(pid)
                            name, username = proc.name(), proc.username()
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            name = username = ""
                        processes[pid] = GPUProcess(
                            pid=pid,
                            used_memory_bytes=int(used) if isinstance(used, int) and used >= 0 else None,
                            name=name,
                            username=username,
                        )
                reservation = reservations.get(index)
                try:
                    temp = int(nvml.nvmlDeviceGetTemperature(handle, nvml.NVML_TEMPERATURE_GPU))
                except Exception:
                    temp = None
                name = nvml.nvmlDeviceGetName(handle)
                uuid = nvml.nvmlDeviceGetUUID(handle)
                if isinstance(name, bytes):
                    name = name.decode(errors="replace")
                if isinstance(uuid, bytes):
                    uuid = uuid.decode(errors="replace")
                result.append(
                    GPUInfo(
                        index=index,
                        uuid=str(uuid),
                        name=str(name),
                        memory_total_bytes=int(memory.total),
                        memory_used_bytes=int(memory.used),
                        memory_free_bytes=int(memory.free),
                        utilization_percent=int(utilization.gpu),
                        temperature_c=temp,
                        processes=list(processes.values()),
                        reserved_by_job_id=reservation,
                        available=reservation is None and not processes,
                    )
                )
            except Exception as exc:
                result.append(
                    GPUInfo(
                        index=index,
                        uuid="",
                        name=f"GPU {index}",
                        memory_total_bytes=0,
                        memory_used_bytes=0,
                        memory_free_bytes=0,
                        utilization_percent=0,
                        temperature_c=None,
                        processes=[],
                        reserved_by_job_id=reservations.get(index),
                        error=str(exc),
                    )
                )
        return result


class DemoGPUMonitor:
    """Deterministic fake GPUs used only by the explicit local demo mode."""

    @property
    def available(self) -> bool:
        return True

    @property
    def error(self) -> str:
        return ""

    def snapshot(self, reservations: dict[int, str] | None = None) -> list[GPUInfo]:
        reservations = reservations or {}
        total = 24 * 1024**3
        result: list[GPUInfo] = []
        for index in range(2):
            reservation = reservations.get(index)
            used = (4 + index * 2) * 1024**3 if reservation is None else 10 * 1024**3
            result.append(
                GPUInfo(
                    index=index,
                    uuid=f"DEMO-GPU-{index}",
                    name="Demo GPU 24GB (simulated)",
                    memory_total_bytes=total,
                    memory_used_bytes=used,
                    memory_free_bytes=total - used,
                    utilization_percent=12 + index * 7 if reservation is None else 68,
                    temperature_c=42 + index,
                    processes=[],
                    reserved_by_job_id=reservation,
                    available=reservation is None,
                )
            )
        return result


def storage_snapshot(path: Path, min_free_gib: float, min_free_percent: float) -> dict[str, Any]:
    try:
        path.mkdir(parents=True, exist_ok=True)
        usage = shutil.disk_usage(path)
        resolved_path = path.resolve(strict=False)
        mount_point = resolved_path
        while mount_point.parent != mount_point and not mount_point.is_mount():
            mount_point = mount_point.parent
    except OSError as exc:
        return {
            "path": str(path),
            "mount_point": "",
            "total_bytes": 0,
            "used_bytes": 0,
            "free_bytes": 0,
            "free_percent": 0.0,
            "low_space": True,
            "threshold_free_gib": min_free_gib,
            "threshold_free_percent": min_free_percent,
            "error": str(exc),
        }
    free_percent = usage.free / usage.total * 100 if usage.total else 0.0
    free_gib = usage.free / (1024**3)
    return {
        "path": str(path),
        "mount_point": str(mount_point),
        "total_bytes": usage.total,
        "used_bytes": usage.used,
        "free_bytes": usage.free,
        "free_percent": round(free_percent, 2),
        "low_space": free_gib < min_free_gib or free_percent < min_free_percent,
        "threshold_free_gib": min_free_gib,
        "threshold_free_percent": min_free_percent,
        "error": "",
    }
