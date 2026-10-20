import { useEffect, useState } from "react";
import { Modal, Form, Input, message } from "antd";

interface CreatedTaskMaster {
    id?: number;
    project_name: string;
    task_name?: string;
    default_hours?: number;
    is_active?: boolean;
    label?: string;
}

interface Props {
    open: boolean;
    onClose: () => void;
    onCreated?: (created: CreatedTaskMaster) => void;
    onSaved?: () => void;
    prefillProjectName?: string;
}

export default function TaskMasterAddModal({ open, onClose, onCreated, onSaved, prefillProjectName }: Props) {
    const [form] = Form.useForm();
    const [saving, setSaving] = useState(false);

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

        const projectName = values.project_name?.trim();
        if (!projectName) return;

        setSaving(true);
        try {
            message.success(`Project "${projectName}" added`);
            onCreated?.({
                id: Date.now(),
                project_name: projectName,
                task_name: "",
                default_hours: 0,
                is_active: true,
                label: projectName,
            });
            onSaved?.();
            handleClose();
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
            title="Add New Project"
            okText="Add Project"
            width={440}
            centered
            destroyOnClose
        >
            <Form form={form} layout="vertical">
                <Form.Item
                    label="Project Name"
                    name="project_name"
                    rules={[
                        { required: true, message: "Please enter a project name" },
                        {
                            validator: (_, value) => {
                                if (value && value.trim().length === 0) {
                                    return Promise.reject(new Error("Project name cannot be empty"));
                                }
                                return Promise.resolve();
                            },
                        },
                    ]}
                >
                    <Input placeholder="e.g. Q3 Marketing Campaign" autoFocus />
                </Form.Item>
            </Form>
        </Modal>
    );
}