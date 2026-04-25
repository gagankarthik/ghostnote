use base64::{engine::general_purpose::STANDARD as BASE64, Engine};

pub fn capture_screenshot_base64() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    return capture_windows();

    #[cfg(not(target_os = "windows"))]
    Err("Screen capture is only supported on Windows".into())
}

#[cfg(target_os = "windows")]
fn capture_windows() -> Result<String, String> {
    use image::{imageops, DynamicImage, ImageBuffer, Rgb};
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS, RGBQUAD,
        SRCCOPY,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};

    unsafe {
        let sw = GetSystemMetrics(SM_CXSCREEN);
        let sh = GetSystemMetrics(SM_CYSCREEN);
        if sw == 0 || sh == 0 {
            return Err("Could not get screen dimensions".into());
        }

        // None = desktop window
        let hscreen = GetDC(None);
        let hmem = CreateCompatibleDC(Some(hscreen));
        let hbmp = CreateCompatibleBitmap(hscreen, sw, sh);

        // HBITMAP implements CanInto<HGDIOBJ> in windows 0.61
        let hold = SelectObject(hmem, hbmp.into());

        BitBlt(hmem, 0, 0, sw, sh, Some(hscreen), 0, 0, SRCCOPY)
            .map_err(|e| format!("BitBlt failed: {e}"))?;

        // 24bpp, DWORD-aligned stride
        let stride = ((sw * 3 + 3) & !3) as usize;
        let total = stride * sh as usize;
        let mut raw = vec![0u8; total];

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: sw,
                biHeight: -sh, // negative = top-down
                biPlanes: 1,
                biBitCount: 24,
                biCompression: 0, // BI_RGB = 0
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [RGBQUAD::default()],
        };

        GetDIBits(
            hmem,
            hbmp,
            0,
            sh as u32,
            Some(raw.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        // Restore DC and clean up
        SelectObject(hmem, hold);
        let _ = DeleteObject(hbmp.into());
        let _ = DeleteDC(hmem);
        ReleaseDC(None, hscreen);

        // Convert BGR (GDI byte order) → RGB, strip DWORD row padding
        let row_w = (sw * 3) as usize;
        let mut rgb: Vec<u8> = Vec::with_capacity(row_w * sh as usize);
        for row in 0..sh as usize {
            let src = &raw[row * stride..row * stride + row_w];
            for px in src.chunks_exact(3) {
                rgb.push(px[2]); // R
                rgb.push(px[1]); // G
                rgb.push(px[0]); // B
            }
        }

        let img: ImageBuffer<Rgb<u8>, Vec<u8>> =
            ImageBuffer::from_raw(sw as u32, sh as u32, rgb)
                .ok_or("Failed to create image buffer")?;

        // Scale to max 1024px wide to keep API costs reasonable
        let max_w: u32 = 1024;
        let scaled = if sw as u32 > max_w {
            let new_h = (sh as f64 * max_w as f64 / sw as f64) as u32;
            imageops::resize(&img, max_w, new_h, imageops::FilterType::Triangle)
        } else {
            img
        };

        let mut jpeg: Vec<u8> = Vec::new();
        DynamicImage::ImageRgb8(scaled)
            .write_to(
                &mut std::io::Cursor::new(&mut jpeg),
                image::ImageFormat::Jpeg,
            )
            .map_err(|e| format!("JPEG encode: {e}"))?;

        Ok(BASE64.encode(&jpeg))
    }
}
