import { useState } from "react";
import { Modal, Form, Input, InputNumber, Select, message } from "antd";

const BASE_URL = import.meta.env.VITE_BASE_URL;

function authHeaders(): HeadersInit {
    try {
        const raw = localStorage.getItem("task_tracker_auth");
        if (!raw) return {};
        const { token } = JSON.parse(raw);
        return token ? { Authorization: `Token ${token}` } : {};
    } catch {
        return {};
    }
}

interface CreatedTaskMaster {
    id: number;
    task_name: string;
    default_hours: number;
    is_active: boolean;
    label: string;
}

interface Props {
    open: boolean;
    onClose: () => void;
    onCreated?: (created: CreatedTaskMaster) => void;
    onSaved?: () => void;
}

// 15-min increments — change to 5 if you want finer control.
const MINUTE_OPTIONS = [0, 15, 30, 45].map((m) => ({ value: m, label: `${m} min` }));

export default function TaskMasterAddModal({ open, onClose, onCreated, onSaved }: Props) {
    const [form] = Form.useForm();
    const [saving, setSaving] = useState(false);

    const handleClose = () => {
        form.resetFields();
        onClose();
    };

    const handleSave = async () => {
        let values;
        try {
            values = await form.validateFields();
        } catch {
            return;
        }

        const hours = Number(values.hours) || 0;
        const minutes = Number(values.minutes) || 0;

        if (hours === 0 && minutes === 0) {
            message.error("Enter hours, minutes, or both — duration can't be zero.");
            return;
        }

        // Round to 2 decimals so it lines up exactly with the DB field's precision.
        const default_hours = Math.round((hours + minutes / 60) * 100) / 100;

        setSaving(true);
        try {
            const res = await fetch(`${BASE_URL}/api/tasks/task_master/create/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({
                    task_name: values.task_name,
                    default_hours,
                    is_active: true,
                }),
            });
            if (res.ok) {
                const created = await res.json();
                message.success(`"${created.task_name}" added to catalog`);
                onCreated?.(created);
                onSaved?.();
                handleClose();
            } else {
                const err = await res.json().catch(() => ({}));
                message.error(err.task_name?.[0] || err.default_hours?.[0] || err.detail || "Failed to add task");
            }
        } catch {
            message.error("Network error");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={open}
            onCancel={handleClose}
            onOk={handleSave}
            confirmLoading={saving}
            title="Add Task to Catalog"
            okText="Add Task"
            width={460}
            centered
            destroyOnClose
        >
            <Form form={form} layout="vertical" initialValues={{ hours: 0, minutes: 0 }}>
                <Form.Item label="Task Name" name="task_name" rules={[{ required: true, message: "Required" }]}>
                    <Input placeholder="e.g. Logo Creation" />
                </Form.Item>

                <div style={{ display: "flex", gap: 12 }}>
                    <Form.Item label="Hours" name="hours" style={{ flex: 1 }}>
                        <InputNumber style={{ width: "100%" }} min={0} step={1} placeholder="e.g. 1" />
                    </Form.Item>
                    <Form.Item label="Minutes" name="minutes" style={{ flex: 1 }}>
                        <Select options={MINUTE_OPTIONS} placeholder="0 min" />
                    </Form.Item>
                </div>
            </Form>
        </Modal>
    );
}