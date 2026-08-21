import { useEffect, useState } from "react";
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
    project_name: string;
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
    /** Prefills Project Name — e.g. opened from the Task Name dropdown's
     * "Add New Task" option while a project is already selected. */
    prefillProjectName?: string;
}

const MINUTE_OPTIONS = [0, 15, 30, 45].map((m) => ({ value: m, label: `${m} min` }));

export default function TaskMasterAddModal({ open, onClose, onCreated, onSaved, prefillProjectName }: Props) {
    const [form] = Form.useForm();
    const [saving, setSaving] = useState(false);

    // destroyOnClose wipes the form each time it closes, so re-apply the
    // prefill every time it opens rather than only on mount.
    useEffect(() => {
        if (open) {
            form.setFieldsValue({ project_name: prefillProjectName || undefined });
        }
    }, [open, prefillProjectName, form]);

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

        const default_hours = Math.round((hours + minutes / 60) * 100) / 100;

        setSaving(true);
        try {
            const res = await fetch(`${BASE_URL}/api/tasks/task_master/create/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({
                    project_name: values.project_name,
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
                message.error(
                    err.project_name?.[0] || err.task_name?.[0] || err.default_hours?.[0] || err.detail || "Failed to add task"
                );
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
                <Form.Item label="Project Name" name="project_name" rules={[{ required: true, message: "Required" }]}>
                    <Input placeholder="e.g. Q3 Marketing Campaign" />
                </Form.Item>

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