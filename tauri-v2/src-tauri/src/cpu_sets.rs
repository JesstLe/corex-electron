use tauri::command;
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::System::Threading::{
    OpenProcess, SetProcessDefaultCpuSets, PROCESS_SET_LIMITED_INFORMATION,
};

/// Set CPU Sets (Soft Affinity) for a process
///
/// CPU Sets allow identifying a set of cores that the process *prefers*.
/// Unlike Affinity Mask (Hard Affinity), the OS can still schedule threads
/// on other cores if necessary (e.g., to avoid starvation), specifically if
/// the process is in the foreground or based on other heuristics.
///
/// Supported on Windows 10 Build 1709+.
#[command]
pub fn set_process_cpu_sets(pid: u32, core_ids: Vec<u32>) -> Result<(), String> {
    unsafe {
        // 1. Open Process with limited info rights (sufficient for CPU Sets)
        let handle = OpenProcess(PROCESS_SET_LIMITED_INFORMATION, false, pid)
            .map_err(|e| format!("Failed to open process {}: {}", pid, e))?;

        // 2. Prepare Core IDs
        // API expects a pointer to ULONG (u32) and count.
        // Even if empty (to reset), we pass the pointer.
        // If core_ids is empty, count is 0, effective clearing the CPU sets.
        // The slice automatically provides pointer and length logic if passed correctly?
        // SetProcessDefaultCpuSets takes (Process: HANDLE, CpuSetIds: *const u32, CpuSetIdCount: u32) -> BOOL (in windows-rs 0.54 it might take slice usually)
        // Let's check signature. windows-rs SetProcessDefaultCpuSets(handle, Some(&[u32])) looks correct.

        let result = SetProcessDefaultCpuSets(handle, Some(&core_ids));

        // 3. Cleanup
        let _ = CloseHandle(handle);

        // 4. Handle Result
        if result.as_bool() {
            Ok(())
        } else {
            let err = windows::core::Error::from_win32();
            Err(format!("Failed to set CPU sets: {}", err))
        }
    }
}
