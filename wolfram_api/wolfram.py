import requests

class WolframAPI:
    def __init__(self, app_id):
        self.app_id = app_id
        self.base_url = "http://api.wolframalpha.com/v1/result"

    def query(self, question):
        params = {
            "i": question,
            "appid": self.app_id
        }
        response = requests.get(self.base_url, params=params)
        return response.text
