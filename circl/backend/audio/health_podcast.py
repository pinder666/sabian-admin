def generate_health_prompt(data):
    name = data.get("name", "there")
    age = data.get("age", "")
    gender = data.get("gender", "")
    occupation = data.get("occupation", "")
    lifestyle = data.get("lifestyle", "")
    main_concern = data.get("main_concern", "")
    health_goal = data.get("health_goal", "")

    return f"{name}, {age}, {gender}, {occupation}, {lifestyle}, {main_concern}, {health_goal}"
