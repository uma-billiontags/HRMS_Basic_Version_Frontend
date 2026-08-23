import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'antd/dist/reset.css';
import './index.css'
import App from './App';

import { ConfigProvider } from "antd";

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      theme={{
        token: {
          fontFamily: "'Poppins', sans-serif",
          fontSize: 13,
          colorText: "#0A0A0A",
          colorTextPlaceholder: "#9CA3AF",
          colorTextDisabled: "#9CA3AF",
          colorBgContainer: "#F3F4F6",
          colorBgContainerDisabled: "#FFFFFF",
          colorBorder: "rgba(0, 0, 0, 0.14)",
          colorPrimary: "#1B3363",
          borderRadius: 8,
          borderRadiusLG: 12,
          controlHeight: 38,
          colorBgElevated: "#FFFFFF",
          boxShadowSecondary: "0 4px 24px rgba(0, 0, 0, 0.06)",
          controlItemBgHover: "rgba(17, 17, 17, 0.06)",
          controlItemBgActive: "rgba(17, 17, 17, 0.06)",
          colorPrimaryBorder: "#3A3A3A",
          controlOutline: "rgba(17, 17, 17, 0.12)",
          controlOutlineWidth: 2,
        },
        components: {
          Select: {
            optionSelectedColor: "#0A0A0A",
            optionSelectedFontWeight: 600,
            optionSelectedBg: "rgba(17, 17, 17, 0.06)",
          },
        },
      }}
    >
      <App />
    </ConfigProvider>
  </StrictMode>,
)